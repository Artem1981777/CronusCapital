// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 a) external returns (bool);
    function transferFrom(address from, address to, uint256 a) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}

contract CronusVault {
    IERC20 public immutable usdc;
    address public owner;
    uint256 public totalShares;
    mapping(address => uint256) public shares;

    event Deposited(address indexed user, uint256 assets, uint256 sharesOut);
    event Withdrawn(address indexed user, uint256 assets, uint256 sharesIn);
    event YieldAdded(uint256 amount);

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
        owner = msg.sender;
    }

    function totalAssets() public view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        uint256 ta = totalAssets();
        if (totalShares == 0 || ta == 0) return assets;
        return assets * totalShares / ta;
    }

    function convertToAssets(uint256 sh) public view returns (uint256) {
        if (totalShares == 0) return 0;
        return sh * totalAssets() / totalShares;
    }

    function deposit(uint256 assets) external returns (uint256 sh) {
        require(assets > 0, "zero amount");
        sh = convertToShares(assets);
        require(usdc.transferFrom(msg.sender, address(this), assets), "transferFrom failed");
        shares[msg.sender] += sh;
        totalShares += sh;
        emit Deposited(msg.sender, assets, sh);
    }

    function withdrawAll() external returns (uint256 assets) {
        uint256 sh = shares[msg.sender];
        require(sh > 0, "no shares");
        assets = convertToAssets(sh);
        shares[msg.sender] = 0;
        totalShares -= sh;
        require(usdc.transfer(msg.sender, assets), "transfer failed");
        emit Withdrawn(msg.sender, assets, sh);
    }

    function addYield(uint256 amount) external {
        require(msg.sender == owner, "only owner");
        require(usdc.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        emit YieldAdded(amount);
    }
}
