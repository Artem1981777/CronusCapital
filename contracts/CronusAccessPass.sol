// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

interface IDrillCertificate {
    function totalSupply() external view returns (uint256);
    function status(uint256 tokenId) external view returns (string memory);
}

/// @title CronusAccessPass
/// @notice One NFT that is three things at once: a paid access key to the signal API, a
/// parametric policy against the agent's own containment failing, and a leash on us.
///
/// The leash is the interesting part. Coverage is only live while the latest fire-drill
/// certificate is still fresh. If we stop exercising the containment, the certificate
/// expires on-chain and this contract suspends coverage by itself. We cannot keep selling
/// protection while quietly letting the proofs go stale.
///
/// Everything is settled on-chain in USDC. Half of each payment stays here as the coverage
/// pool, so the policy is backed by funds a reader can see rather than by a promise.
contract CronusAccessPass {
    string public constant name = "Cronus Access Pass";
    string public constant symbol = "CRNPASS";

    IERC20 public immutable usdc;
    IDrillCertificate public immutable certificate;
    address public immutable treasury;
    uint256 public immutable price;           // micro-USDC
    uint256 public immutable period;          // seconds of access per payment
    uint256 public immutable coveragePerPass; // micro-USDC, upper bound per pass

    uint256 public totalSupply;
    uint256 public poolUsdc; // coverage pool held by this contract

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) public passOf;     // one pass per address, keeps state honest
    mapping(uint256 => uint64) public expiresAt;
    mapping(uint256 => bool) public claimed;
    mapping(uint256 => address) private _approved;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event Purchased(uint256 indexed tokenId, address indexed buyer, uint64 expiresAt, uint256 toPool);
    event Renewed(uint256 indexed tokenId, uint64 expiresAt);
    event Claimed(uint256 indexed tokenId, address indexed to, uint256 amount);

    error NoToken();
    error AlreadyHasPass();
    error NotOwner();

    constructor(
        address _usdc,
        address _treasury,
        address _certificate,
        uint256 _price,
        uint256 _period,
        uint256 _coveragePerPass
    ) {
        require(_usdc != address(0) && _treasury != address(0) && _certificate != address(0), "zero addr");
        require(_price > 0 && _period > 0, "bad terms");
        usdc = IERC20(_usdc);
        treasury = _treasury;
        certificate = IDrillCertificate(_certificate);
        price = _price;
        period = _period;
        coveragePerPass = _coveragePerPass;
    }

    // ---- buying access: a real USDC transfer, not a button on a website ----
    function mint() external returns (uint256 tokenId) {
        if (passOf[msg.sender] != 0) revert AlreadyHasPass();
        uint256 toPool = price / 2;
        require(usdc.transferFrom(msg.sender, address(this), toPool), "pool transfer failed");
        require(usdc.transferFrom(msg.sender, treasury, price - toPool), "treasury transfer failed");
        poolUsdc += toPool;

        tokenId = ++totalSupply;
        _owners[tokenId] = msg.sender;
        passOf[msg.sender] = tokenId;
        expiresAt[tokenId] = uint64(block.timestamp + period);

        emit Transfer(address(0), msg.sender, tokenId);
        emit Purchased(tokenId, msg.sender, expiresAt[tokenId], toPool);
    }

    function renew(uint256 tokenId) external {
        if (_owners[tokenId] == address(0)) revert NoToken();
        uint256 toPool = price / 2;
        require(usdc.transferFrom(msg.sender, address(this), toPool), "pool transfer failed");
        require(usdc.transferFrom(msg.sender, treasury, price - toPool), "treasury transfer failed");
        poolUsdc += toPool;
        uint64 base = expiresAt[tokenId] > block.timestamp ? expiresAt[tokenId] : uint64(block.timestamp);
        expiresAt[tokenId] = base + uint64(period);
        emit Renewed(tokenId, expiresAt[tokenId]);
    }

    // ---- the leash: coverage depends on the drills actually being run ----
    function latestCertificateStatus() public view returns (string memory) {
        uint256 n = certificate.totalSupply();
        if (n == 0) return "NONE";
        return certificate.status(n);
    }

    /// @return live whether the policy currently pays at all
    /// @return reason a human-readable explanation, including when it does not
    function coverage() public view returns (bool live, string memory reason) {
        string memory st = latestCertificateStatus();
        bytes32 h = keccak256(bytes(st));
        if (h == keccak256("NONE")) return (false, "no fire drill has ever been certified");
        if (h == keccak256("EXPIRED")) return (false, "the latest drill certificate went stale, so coverage is suspended until the containment is exercised again");
        if (h == keccak256("REVOKED")) return (false, "the latest drill certificate was revoked by the guardian");
        if (h == keccak256("BREACHED")) return (true, "a drill scenario was breached: this is the payout condition");
        return (true, "the containment was exercised and held");
    }

    function breached() public view returns (bool) {
        return keccak256(bytes(latestCertificateStatus())) == keccak256("BREACHED");
    }

    /// @notice What one pass is actually backed by right now, not what we wish it were.
    function backedPerPass() public view returns (uint256) {
        uint256 active = totalSupply;
        if (active == 0) return 0;
        uint256 fairShare = poolUsdc / active;
        return fairShare < coveragePerPass ? fairShare : coveragePerPass;
    }

    function isActive(uint256 tokenId) public view returns (bool) {
        return _owners[tokenId] != address(0) && expiresAt[tokenId] > block.timestamp;
    }

    /// @notice Server-side gate reads this with eth_call: no subscription database anywhere.
    function hasAccess(address who) external view returns (bool) {
        uint256 id = passOf[who];
        return id != 0 && expiresAt[id] > block.timestamp;
    }

    // ---- the payout: parametric, triggered by our own failure, paid in real USDC ----
    function claim(uint256 tokenId) external returns (uint256 amount) {
        address o = _owners[tokenId];
        if (o == address(0)) revert NoToken();
        if (msg.sender != o) revert NotOwner();
        require(!claimed[tokenId], "already claimed");
        require(isActive(tokenId), "pass expired");
        require(breached(), "payout condition not met: no breached drill");

        amount = backedPerPass();
        require(amount > 0, "coverage pool is empty");
        claimed[tokenId] = true;
        poolUsdc -= amount;
        require(usdc.transfer(o, amount), "payout failed");
        emit Claimed(tokenId, o, amount);
    }

    // ---- ERC-721 surface: transferable, but one pass per address keeps the state readable ----
    function ownerOf(uint256 tokenId) public view returns (address o) {
        o = _owners[tokenId];
        if (o == address(0)) revert NoToken();
    }
    function balanceOf(address a) external view returns (uint256) {
        return passOf[a] == 0 ? 0 : 1;
    }
    function approve(address to, uint256 tokenId) external {
        if (_owners[tokenId] != msg.sender) revert NotOwner();
        _approved[tokenId] = to;
        emit Approval(msg.sender, to, tokenId);
    }
    function getApproved(uint256 tokenId) external view returns (address) { return _approved[tokenId]; }
    function setApprovalForAll(address, bool) external pure { revert("one pass per address"); }
    function isApprovedForAll(address, address) external pure returns (bool) { return false; }
    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_owners[tokenId] == from, "wrong from");
        require(msg.sender == from || _approved[tokenId] == msg.sender, "not authorized");
        require(to != address(0), "zero to");
        if (passOf[to] != 0) revert AlreadyHasPass();
        delete _approved[tokenId];
        passOf[from] = 0;
        passOf[to] = tokenId;
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }
    function safeTransferFrom(address from, address to, uint256 tokenId) external { transferFrom(from, to, tokenId); }
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external { transferFrom(from, to, tokenId); }
    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f;
    }

    // ---- on-chain metadata, assembled in small frames so the stack survives ----
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert NoToken();
        return string.concat("data:application/json;base64,", _b64(bytes(_json(tokenId))));
    }

    function _state(uint256 tokenId) internal view returns (string memory) {
        if (!isActive(tokenId)) return "LAPSED";
        (bool live, ) = coverage();
        return live ? (breached() ? "CLAIMABLE" : "ACTIVE") : "UNCOVERED";
    }

    function _color(string memory s) internal pure returns (string memory) {
        bytes32 h = keccak256(bytes(s));
        if (h == keccak256("ACTIVE")) return "#4ade80";
        if (h == keccak256("CLAIMABLE")) return "#facc15";
        if (h == keccak256("UNCOVERED")) return "#f87171";
        return "#94a3b8";
    }

    function _json(uint256 tokenId) internal view returns (string memory) {
        return string.concat(
            _jsonHead(tokenId),
            "\"image\":\"data:image/svg+xml;base64,", _b64(bytes(_svg(tokenId))), "\",",
            "\"attributes\":[", _jsonAttrs(tokenId), "]}"
        );
    }

    function _jsonHead(uint256 tokenId) internal view returns (string memory) {
        return string.concat(
            "{\"name\":\"Cronus Access Pass #", _u(tokenId), " - ", _state(tokenId),
            "\",\"description\":\"An access key to the Cronus signal API and a parametric policy against the agent's containment failing. Coverage is live only while the latest fire-drill certificate is fresh: if the operator stops exercising the containment, this contract suspends coverage on its own. The payout is backed by USDC held in this contract, and the amount shown is what the pool can actually pay per pass today, not an aspiration.\","
        );
    }

    function _jsonAttrs(uint256 tokenId) internal view returns (string memory) {
        (, string memory reason) = coverage();
        return string.concat(
            "{\"trait_type\":\"State\",\"value\":\"", _state(tokenId), "\"},",
            "{\"trait_type\":\"Expires (unix)\",\"value\":", _u(expiresAt[tokenId]), "},",
            "{\"trait_type\":\"Latest drill certificate\",\"value\":\"", latestCertificateStatus(), "\"},",
            "{\"trait_type\":\"Coverage note\",\"value\":\"", reason, "\"},",
            "{\"trait_type\":\"Backed per pass (USDC)\",\"value\":", _usd(backedPerPass()), "},",
            "{\"trait_type\":\"Pool (USDC)\",\"value\":", _usd(poolUsdc), "}"
        );
    }

    function _svg(uint256 tokenId) internal view returns (string memory) {
        return string.concat(_svgTop(tokenId), _svgMid(tokenId), _svgFoot(tokenId));
    }

    function _svgTop(uint256 tokenId) internal pure returns (string memory) {
        return string.concat(
            "<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'>",
            "<rect width='600' height='600' fill='#08090c'/>",
            "<text x='40' y='70' fill='#64748b' font-family='monospace' font-size='16'>CRONUS CAPITAL / ARC</text>",
            "<text x='40' y='125' fill='#e2e8f0' font-family='monospace' font-size='32'>ACCESS PASS #", _u(tokenId), "</text>",
            "<rect x='40' y='160' width='520' height='2' fill='#1e293b'/>"
        );
    }

    function _svgMid(uint256 tokenId) internal view returns (string memory) {
        string memory st = _state(tokenId);
        return string.concat(
            "<text x='40' y='225' fill='", _color(st), "' font-family='monospace' font-size='42'>", st, "</text>",
            "<text x='40' y='275' fill='#64748b' font-family='monospace' font-size='15'>COVERAGE FOLLOWS THE DRILLS</text>",
            "<text x='40' y='310' fill='#e2e8f0' font-family='monospace' font-size='22'>latest certificate: ", latestCertificateStatus(), "</text>"
        );
    }

    function _svgFoot(uint256 tokenId) internal view returns (string memory) {
        return string.concat(
            "<text x='40' y='375' fill='#64748b' font-family='monospace' font-size='15'>BACKED PER PASS TODAY</text>",
            "<text x='40' y='415' fill='#e2e8f0' font-family='monospace' font-size='26'>", _usd(backedPerPass()), " USDC</text>",
            "<text x='40' y='455' fill='#64748b' font-family='monospace' font-size='15'>POOL ", _usd(poolUsdc), " USDC</text>",
            "<text x='40' y='520' fill='#475569' font-family='monospace' font-size='14'>access expires at unix ", _u(expiresAt[tokenId]), "</text>",
            "<text x='40' y='545' fill='#475569' font-family='monospace' font-size='14'>if we stop drilling, this pass says so by itself</text></svg>"
        );
    }

    // ---- tiny helpers ----
    function _u(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 j = v;
        uint256 len;
        while (j != 0) { len++; j /= 10; }
        bytes memory b = new bytes(len);
        while (v != 0) { len--; b[len] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(b);
    }

    function _usd(uint256 micros) internal pure returns (string memory) {
        uint256 whole = micros / 1e6;
        uint256 cents = (micros % 1e6) / 1e4;
        return cents == 0 ? _u(whole) : string.concat(_u(whole), ".", cents < 10 ? "0" : "", _u(cents));
    }

    bytes internal constant B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    function _b64(bytes memory data) internal pure returns (string memory) {
        if (data.length == 0) return "";
        uint256 encLen = 4 * ((data.length + 2) / 3);
        bytes memory result = new bytes(encLen);
        bytes memory table = B64;
        assembly {
            let tablePtr := add(table, 1)
            let resultPtr := add(result, 32)
            for { let i := 0 } lt(i, mload(data)) { i := add(i, 3) } {
                let input := and(mload(add(add(data, 32), i)), 0xffffff0000000000000000000000000000000000000000000000000000000000)
                let out := mload(add(tablePtr, and(shr(250, input), 0x3F)))
                out := shl(8, out)
                out := add(out, and(mload(add(tablePtr, and(shr(244, input), 0x3F))), 0xFF))
                out := shl(8, out)
                out := add(out, and(mload(add(tablePtr, and(shr(238, input), 0x3F))), 0xFF))
                out := shl(8, out)
                out := add(out, and(mload(add(tablePtr, and(shr(232, input), 0x3F))), 0xFF))
                out := shl(224, out)
                mstore(resultPtr, out)
                resultPtr := add(resultPtr, 4)
            }
            switch mod(mload(data), 3)
            case 1 { mstore(sub(resultPtr, 2), shl(240, 0x3d3d)) }
            case 2 { mstore(sub(resultPtr, 1), shl(248, 0x3d)) }
        }
        return string(result);
    }
}
