// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Harness.sol";
import "../CronusMultisig.sol";

contract CallTarget {
    uint256 public last;
    function ping(uint256 x) external { last = x; }
}

contract CronusMultisigTest is Test {
    CronusMultisig ms;
    CallTarget target;

    address ownerB   = address(0xB0B);
    address ownerC   = address(0xC0C);
    address stranger = address(0xBAD);

    function setUp() public {
        address[] memory os = new address[](3);
        os[0] = address(this);
        os[1] = ownerB;
        os[2] = ownerC;
        ms = new CronusMultisig(os, 2);
        target = new CallTarget();
    }

    function test_Constructor() public {
        assertEq(ms.ownersCount(), uint256(3));
        assertEq(ms.threshold(), uint256(2));
        assertTrue(ms.isOwner(address(this)));
        assertTrue(ms.isOwner(ownerB));
        assertTrue(ms.isOwner(ownerC));
    }

    function test_ConstructorRejectsBadThreshold() public {
        address[] memory os = new address[](2);
        os[0] = address(this);
        os[1] = ownerB;
        vm.expectRevert(); // bad threshold (0)
        new CronusMultisig(os, 0);
    }

    function test_StrangerCannotSubmit() public {
        bytes memory data = abi.encodeWithSelector(target.ping.selector, uint256(42));
        vm.prank(stranger);
        vm.expectRevert(); // not owner
        ms.submit(address(target), 0, data);
    }

    function test_SubmitAutoConfirms() public {
        bytes memory data = abi.encodeWithSelector(target.ping.selector, uint256(42));
        uint256 id = ms.submit(address(target), 0, data);
        (, , , bool executed, uint256 confs) = ms.txs(id);
        assertEq(confs, uint256(1));
        assertTrue(!executed);
    }

    function test_CannotExecuteBelowThreshold() public {
        bytes memory data = abi.encodeWithSelector(target.ping.selector, uint256(42));
        uint256 id = ms.submit(address(target), 0, data);
        vm.expectRevert(); // not enough confirmations
        ms.execute(id);
    }

    function test_ExecuteAtThreshold() public {
        bytes memory data = abi.encodeWithSelector(target.ping.selector, uint256(42));
        uint256 id = ms.submit(address(target), 0, data);
        vm.prank(ownerB);
        ms.confirm(id);
        ms.execute(id);
        assertEq(target.last(), uint256(42));
    }

    function test_NoDoubleConfirm() public {
        bytes memory data = abi.encodeWithSelector(target.ping.selector, uint256(1));
        uint256 id = ms.submit(address(target), 0, data);
        vm.expectRevert(); // submitter already auto-confirmed
        ms.confirm(id);
    }

    function test_RevokeDropsBelowThreshold() public {
        bytes memory data = abi.encodeWithSelector(target.ping.selector, uint256(1));
        uint256 id = ms.submit(address(target), 0, data);
        vm.prank(ownerB);
        ms.confirm(id);
        ms.revoke(id);
        (, , , , uint256 confs) = ms.txs(id);
        assertEq(confs, uint256(1));
        vm.expectRevert(); // below threshold again
        ms.execute(id);
    }

    function test_AdminOnlyViaWallet() public {
        vm.expectRevert(); // not wallet (no external backdoor)
        ms.addOwner(stranger);
    }

    function test_SelfAdminAddOwner() public {
        bytes memory data = abi.encodeWithSelector(ms.addOwner.selector, stranger);
        uint256 id = ms.submit(address(ms), 0, data);
        vm.prank(ownerB);
        ms.confirm(id);
        ms.execute(id);
        assertTrue(ms.isOwner(stranger));
        assertEq(ms.ownersCount(), uint256(4));
    }

    function test_SelfAdminSetThreshold() public {
        bytes memory data = abi.encodeWithSelector(ms.setThreshold.selector, uint256(3));
        uint256 id = ms.submit(address(ms), 0, data);
        vm.prank(ownerB);
        ms.confirm(id);
        ms.execute(id);
        assertEq(ms.threshold(), uint256(3));
    }

    function test_CannotReexecute() public {
        bytes memory data = abi.encodeWithSelector(target.ping.selector, uint256(7));
        uint256 id = ms.submit(address(target), 0, data);
        vm.prank(ownerB);
        ms.confirm(id);
        ms.execute(id);
        vm.expectRevert(); // already executed
        ms.execute(id);
    }
}
