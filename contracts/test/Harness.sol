// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function warp(uint256) external;
}

contract Test {
    Vm internal constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
    function assertTrue(bool c) internal pure { require(c, "assertTrue failed"); }
    function assertEq(uint256 a, uint256 b) internal pure { require(a == b, "assertEq(uint) failed"); }
    function assertEq(address a, address b) internal pure { require(a == b, "assertEq(addr) failed"); }
    function assertEq(bool a, bool b) internal pure { require(a == b, "assertEq(bool) failed"); }
    function assertEq(string memory a, string memory b) internal pure { require(keccak256(bytes(a)) == keccak256(bytes(b)), "assertEq(str) failed"); }
}

contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) {
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(balanceOf[f] >= a, "balance");
        uint256 al = allowance[f][msg.sender];
        require(al >= a, "allowance");
        if (al != type(uint256).max) allowance[f][msg.sender] = al - a;
        balanceOf[f] -= a; balanceOf[to] += a; return true;
    }
}
