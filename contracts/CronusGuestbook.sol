// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICronusIdentityRegistry {
    function isRegistered(address agentAddress) external view returns (bool);
}

/// @title Cronus Guestbook
/// @notice A permissionless, append-only public log deployed once and shared by everyone.
///         Any connected wallet can leave a short on-chain note. Notes from addresses
///         registered in CronusIdentityRegistry are flagged as agent notes. No owner,
///         no privileged functions, no value transfer — pure public record.
contract CronusGuestbook {
    struct Note {
        address author;
        string message;
        bool isAgent;
        uint256 timestamp;
    }

    ICronusIdentityRegistry public immutable identityRegistry;
    uint256 public constant MAX_MESSAGE_LENGTH = 280;
    uint256 public constant MIN_INTERVAL = 30; // seconds between notes, per address

    Note[] private _notes;
    mapping(address => uint256) public lastNoteAt;

    event NoteLeft(uint256 indexed noteId, address indexed author, bool isAgent, string message, uint256 timestamp);

    error MessageTooLong();
    error EmptyMessage();
    error TooSoon(uint256 retryAfter);

    constructor(address identityRegistry_) {
        identityRegistry = ICronusIdentityRegistry(identityRegistry_);
    }

    function leaveNote(string calldata message) external returns (uint256 noteId) {
        uint256 len = bytes(message).length;
        if (len == 0) revert EmptyMessage();
        if (len > MAX_MESSAGE_LENGTH) revert MessageTooLong();
        uint256 last = lastNoteAt[msg.sender];
        if (last != 0 && block.timestamp < last + MIN_INTERVAL) {
            revert TooSoon(last + MIN_INTERVAL - block.timestamp);
        }
        bool agent = identityRegistry.isRegistered(msg.sender);
        noteId = _notes.length;
        _notes.push(Note({ author: msg.sender, message: message, isAgent: agent, timestamp: block.timestamp }));
        lastNoteAt[msg.sender] = block.timestamp;
        emit NoteLeft(noteId, msg.sender, agent, message, block.timestamp);
    }

    function noteCount() external view returns (uint256) {
        return _notes.length;
    }

    function getNote(uint256 id) external view returns (Note memory) {
        return _notes[id];
    }

    /// @notice Up to `count` most recent notes, newest first.
    function getRecentNotes(uint256 count) external view returns (Note[] memory result) {
        uint256 total = _notes.length;
        uint256 n = count > total ? total : count;
        result = new Note[](n);
        for (uint256 i = 0; i < n; i++) {
            result[i] = _notes[total - 1 - i];
        }
    }
}
