// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title CronusDrillCertificate
/// @notice A soulbound certificate for one fire drill against the live agent guard.
/// Metadata and artwork are generated on-chain: no IPFS, no server, nothing we can
/// quietly edit later. The certificate is deliberately able to look bad - a drill with
/// skipped scenarios renders as incomplete, and every certificate expires on its own
/// after a day, because a safety claim older than the contract it describes is noise.
/// It also states the one thing it cannot do: verify the transaction hashes it stores.
contract CronusDrillCertificate {
    string public constant name = "Cronus Fire Drill Certificate";
    string public constant symbol = "DRILL";
    uint256 public constant FRESH_FOR = 1 days;

    address public immutable operator; // the agent key that runs the drills, mint only
    address public immutable guardian; // negative power only: revoke
    address public immutable holder;   // every certificate is minted to the multisig
    address public immutable guard;    // the contract that was attacked

    struct Scenario {
        string id;
        string expect;
        string outcome;
        string reason;
        bytes32 txHash;
        uint64 blockNumber;
    }

    struct Cert {
        uint64 finishedAt;
        uint64 immediateMicros;
        uint64 dailyMicros;
        uint64 ceilingMicros;
        uint32 total;
        uint32 passed;
        uint32 skipped;
        uint32 failed;
        bool revoked;
    }

    uint256 public totalSupply;
    mapping(uint256 => address) private _owners;
    mapping(uint256 => Cert) public certs;
    mapping(uint256 => Scenario[]) private _scenarios;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Minted(uint256 indexed tokenId, uint32 passed, uint32 total, uint32 skipped, uint32 failed);
    event Revoked(uint256 indexed tokenId, address by);

    error Soulbound();
    error NotOperator();
    error NotGuardian();
    error NoToken();

    constructor(address _operator, address _guardian, address _holder, address _guard) {
        require(_operator != address(0) && _guardian != address(0) && _holder != address(0), "zero addr");
        operator = _operator;
        guardian = _guardian;
        holder = _holder;
        guard = _guard;
    }

    // ---- minting: only the key that actually ran the drill ----
    function mint(
        uint64 finishedAt,
        uint64 immediateMicros,
        uint64 dailyMicros,
        uint64 ceilingMicros,
        Scenario[] calldata scen
    ) external returns (uint256 tokenId) {
        if (msg.sender != operator) revert NotOperator();
        require(scen.length > 0 && scen.length < 64, "bad scenario count");

        tokenId = ++totalSupply;
        uint32 passed;
        uint32 skipped;
        uint32 failed;

        for (uint256 i = 0; i < scen.length; i++) {
            _scenarios[tokenId].push(scen[i]);
            bytes32 o = keccak256(bytes(scen[i].outcome));
            bytes32 e = keccak256(bytes(scen[i].expect));
            if (o == keccak256("skipped")) {
                skipped++;
            } else if (
                (e == keccak256("revert") && o == keccak256("reverted")) ||
                (e == keccak256("success") && o == keccak256("succeeded"))
            ) {
                passed++;
            } else {
                failed++;
            }
        }

        certs[tokenId] = Cert({
            finishedAt: finishedAt,
            immediateMicros: immediateMicros,
            dailyMicros: dailyMicros,
            ceilingMicros: ceilingMicros,
            total: uint32(scen.length),
            passed: passed,
            skipped: skipped,
            failed: failed,
            revoked: false
        });

        _owners[tokenId] = holder;
        emit Transfer(address(0), holder, tokenId);
        emit Minted(tokenId, passed, uint32(scen.length), skipped, failed);
    }

    /// @notice The guardian can strike a certificate. Negative power only, as everywhere else.
    function revoke(uint256 tokenId) external {
        if (msg.sender != guardian) revert NotGuardian();
        if (_owners[tokenId] == address(0)) revert NoToken();
        certs[tokenId].revoked = true;
        emit Revoked(tokenId, msg.sender);
    }

    // ---- soulbound ERC-721 surface ----
    function ownerOf(uint256 tokenId) public view returns (address o) {
        o = _owners[tokenId];
        if (o == address(0)) revert NoToken();
    }
    function balanceOf(address a) external view returns (uint256) {
        return a == holder ? totalSupply : 0;
    }
    function scenarioCount(uint256 tokenId) external view returns (uint256) {
        return _scenarios[tokenId].length;
    }
    function scenarioAt(uint256 tokenId, uint256 i) external view returns (Scenario memory) {
        return _scenarios[tokenId][i];
    }
    function transferFrom(address, address, uint256) external pure { revert Soulbound(); }
    function safeTransferFrom(address, address, uint256) external pure { revert Soulbound(); }
    function safeTransferFrom(address, address, uint256, bytes calldata) external pure { revert Soulbound(); }
    function approve(address, uint256) external pure { revert Soulbound(); }
    function setApprovalForAll(address, bool) external pure { revert Soulbound(); }
    function getApproved(uint256) external pure returns (address) { return address(0); }
    function isApprovedForAll(address, address) external pure returns (bool) { return false; }
    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f;
    }

    // ---- status, computed from the chain clock, not asserted ----
    function status(uint256 tokenId) public view returns (string memory) {
        Cert memory c = certs[tokenId];
        if (_owners[tokenId] == address(0)) revert NoToken();
        if (c.revoked) return "REVOKED";
        if (block.timestamp > uint256(c.finishedAt) + FRESH_FOR) return "EXPIRED";
        if (c.failed > 0) return "BREACHED";
        if (c.skipped > 0) return "INCOMPLETE";
        return "HOLDING";
    }

    function _color(string memory s) internal pure returns (string memory) {
        bytes32 h = keccak256(bytes(s));
        if (h == keccak256("HOLDING")) return "#4ade80";
        if (h == keccak256("BREACHED")) return "#f87171";
        if (h == keccak256("REVOKED")) return "#f87171";
        return "#94a3b8";
    }

    // Metadata is assembled in small pieces on purpose: one giant concat blows the stack.
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert NoToken();
        return string.concat("data:application/json;base64,", _b64(bytes(_json(tokenId))));
    }

    function _json(uint256 tokenId) internal view returns (string memory) {
        return string.concat(
            _jsonHead(tokenId),
            "\"image\":\"data:image/svg+xml;base64,", _b64(bytes(_svg(tokenId))), "\",",
            "\"attributes\":[", _jsonAttrs(tokenId), _scenarioAttrs(tokenId), "]}"
        );
    }

    function _jsonHead(uint256 tokenId) internal view returns (string memory) {
        return string.concat(
            "{\"name\":\"Fire Drill Certificate #", _u(tokenId), " - ", status(tokenId),
            "\",\"description\":\"One exercise of the Cronus agent containment on Arc. Rogue transactions were signed by the live agent key against the live guard; a rejection is a FAILED transaction in a mined block. This contract stores transaction hashes it cannot itself verify - check them on the explorer. Skipped scenarios are never counted as passed. The certificate expires on its own one day after the drill, because a safety claim older than the system it describes is noise. Soulbound: a certificate of containment that can be sold is meaningless.\","
        );
    }

    function _jsonAttrs(uint256 tokenId) internal view returns (string memory) {
        Cert memory c = certs[tokenId];
        return string.concat(
            "{\"trait_type\":\"Status\",\"value\":\"", status(tokenId), "\"},",
            "{\"trait_type\":\"Scenarios proven\",\"value\":", _u(c.passed), "},",
            "{\"trait_type\":\"Scenarios skipped\",\"value\":", _u(c.skipped), "},",
            "{\"trait_type\":\"Scenarios breached\",\"value\":", _u(c.failed), "},",
            "{\"trait_type\":\"Worst case now (USDC)\",\"value\":", _usd(c.immediateMicros), "},",
            "{\"trait_type\":\"Worst case per 24h (USDC)\",\"value\":", _usd(c.dailyMicros), "}"
        );
    }

    function _svg(uint256 tokenId) internal view returns (string memory) {
        return string.concat(_svgTop(tokenId), _svgMid(tokenId), _svgFoot(tokenId));
    }

    function _svgTop(uint256 tokenId) internal view returns (string memory) {
        return string.concat(
            "<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'>",
            "<rect width='600' height='600' fill='#08090c'/>",
            "<text x='40' y='70' fill='#64748b' font-family='monospace' font-size='16'>CRONUS CAPITAL / ARC</text>",
            "<text x='40' y='120' fill='#e2e8f0' font-family='monospace' font-size='30'>FIRE DRILL</text>",
            "<text x='40' y='160' fill='#e2e8f0' font-family='monospace' font-size='30'>CERTIFICATE #", _u(tokenId), "</text>",
            "<rect x='40' y='200' width='520' height='2' fill='#1e293b'/>"
        );
    }

    function _svgMid(uint256 tokenId) internal view returns (string memory) {
        Cert memory c = certs[tokenId];
        string memory st = status(tokenId);
        return string.concat(
            "<text x='40' y='260' fill='", _color(st), "' font-family='monospace' font-size='44'>", st, "</text>",
            "<text x='40' y='305' fill='#94a3b8' font-family='monospace' font-size='22'>", _u(c.passed),
            " of ", _u(c.total), " proven",
            c.skipped > 0 ? string.concat(", ", _u(c.skipped), " unproven") : "", "</text>"
        );
    }

    function _svgFoot(uint256 tokenId) internal view returns (string memory) {
        Cert memory c = certs[tokenId];
        return string.concat(
            "<text x='40' y='370' fill='#64748b' font-family='monospace' font-size='15'>WORST CASE IF THE AGENT KEY IS STOLEN</text>",
            "<text x='40' y='410' fill='#e2e8f0' font-family='monospace' font-size='26'>", _usd(c.immediateMicros),
            " now / ", _usd(c.dailyMicros), " per 24h</text>",
            "<text x='40' y='445' fill='#64748b' font-family='monospace' font-size='15'>IMMUTABLE CEILING ", _usd(c.ceilingMicros), " USDC</text>",
            "<text x='40' y='520' fill='#475569' font-family='monospace' font-size='14'>drill finished at unix ", _u(c.finishedAt), "</text>",
            "<text x='40' y='545' fill='#475569' font-family='monospace' font-size='14'>expires one day later, on-chain, with no oracle</text></svg>"
        );
    }

    function _scenarioAttrs(uint256 tokenId) internal view returns (string memory out) {
        Scenario[] storage sc = _scenarios[tokenId];
        for (uint256 i = 0; i < sc.length; i++) {
            out = string.concat(out, ",{\"trait_type\":\"", sc[i].id, "\",\"value\":\"", sc[i].outcome, "\"}");
        }
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

    /// @dev micro-USDC to a plain decimal string, two places, no rounding tricks
    function _usd(uint256 micros) internal pure returns (string memory) {
        uint256 whole = micros / 1e6;
        uint256 cents = (micros % 1e6) / 1e4;
        return cents == 0
            ? _u(whole)
            : string.concat(_u(whole), ".", cents < 10 ? "0" : "", _u(cents));
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
