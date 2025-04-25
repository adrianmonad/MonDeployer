// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title AdvancedVoting
 * @dev A comprehensive voting contract with multiple proposals, delegation, and voting periods
 */
contract AdvancedVoting {
    // Proposal structure
    struct Proposal {
        string title;
        string description;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 votesAbstain;
        uint256 startTime;
        uint256 endTime;
        bool executed;
        address[] voters;
        bytes32 proposalHash;
    }

    // Voter structure
    struct Voter {
        uint256 weight;        // Weight is accumulated by delegation
        bool hasVoted;         // If true, that person already voted
        uint8 vote;            // Index of the voted proposal
        address delegate;      // Person delegated to
        mapping(bytes32 => bool) proposalVotes; // Track votes by proposal hash
    }

    // Vote options
    enum VoteOption { Against, For, Abstain }

    // Contract state variables
    address public admin;
    mapping(address => Voter) public voters;
    Proposal[] public proposals;
    mapping(address => bool) public hasRegistered;
    mapping(bytes32 => bool) public proposalExists;
    
    // Events
    event ProposalCreated(uint256 indexed proposalId, string title, address creator, uint256 startTime, uint256 endTime);
    event VoterRegistered(address indexed voter);
    event VoteCast(address indexed voter, uint256 indexed proposalId, VoteOption vote);
    event ProposalExecuted(uint256 indexed proposalId);
    event VotingRightsGranted(address indexed voter, uint256 weight);
    event Delegated(address indexed from, address indexed to);

    // Modifiers
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    modifier onlyRegistered() {
        require(hasRegistered[msg.sender], "You must be registered to vote");
        _;
    }

    modifier proposalActive(uint256 proposalId) {
        require(proposalId < proposals.length, "Proposal does not exist");
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp >= proposal.startTime, "Voting has not started yet");
        require(block.timestamp <= proposal.endTime, "Voting has ended");
        _;
    }

    // Constructor
    constructor() {
        admin = msg.sender;
        
        // Register the admin automatically
        registerVoter(msg.sender);
        grantVotingRights(msg.sender, 1);
    }

    /**
     * @dev Register a voter
     * @param voter The address of the voter
     */
    function registerVoter(address voter) public onlyAdmin {
        require(!hasRegistered[voter], "Voter already registered");
        hasRegistered[voter] = true;
        emit VoterRegistered(voter);
    }

    /**
     * @dev Register multiple voters at once
     * @param voterAddresses Array of voter addresses to register
     */
    function batchRegisterVoters(address[] calldata voterAddresses) external onlyAdmin {
        for (uint i = 0; i < voterAddresses.length; i++) {
            if (!hasRegistered[voterAddresses[i]]) {
                registerVoter(voterAddresses[i]);
            }
        }
    }

    /**
     * @dev Grant voting rights to a voter
     * @param voter The address of the voter
     * @param weight The voting weight to assign
     */
    function grantVotingRights(address voter, uint256 weight) public onlyAdmin {
        require(hasRegistered[voter], "Voter is not registered");
        require(voters[voter].weight == 0, "Voter already has voting rights");
        voters[voter].weight = weight;
        emit VotingRightsGranted(voter, weight);
    }

    /**
     * @dev Create a new proposal
     * @param title Title of the proposal
     * @param description Description of the proposal
     * @param startTime Starting time for voting
     * @param duration Duration of voting in seconds
     */
    function createProposal(
        string calldata title,
        string calldata description,
        uint256 startTime,
        uint256 duration
    ) external onlyAdmin {
        require(bytes(title).length > 0, "Title cannot be empty");
        require(startTime >= block.timestamp, "Start time must be in the future");
        require(duration > 0, "Duration must be positive");
        
        bytes32 proposalHash = keccak256(abi.encodePacked(title, description, startTime));
        require(!proposalExists[proposalHash], "A similar proposal already exists");
        
        uint256 endTime = startTime + duration;
        address[] memory initialVoters;
        
        Proposal memory newProposal = Proposal({
            title: title,
            description: description,
            votesFor: 0,
            votesAgainst: 0,
            votesAbstain: 0,
            startTime: startTime,
            endTime: endTime,
            executed: false,
            voters: initialVoters,
            proposalHash: proposalHash
        });
        
        proposalExists[proposalHash] = true;
        uint256 proposalId = proposals.length;
        proposals.push(newProposal);
        
        emit ProposalCreated(proposalId, title, msg.sender, startTime, endTime);
    }

    /**
     * @dev Delegate voting rights to another voter
     * @param to The address to delegate to
     */
    function delegate(address to) external onlyRegistered {
        require(to != msg.sender, "Cannot delegate to yourself");
        require(hasRegistered[to], "Delegate is not registered");
        
        Voter storage sender = voters[msg.sender];
        require(sender.weight > 0, "You have no voting rights to delegate");
        require(!sender.hasVoted, "You already voted");
        require(sender.delegate == address(0), "You already delegated");
        
        // Check for circular delegation
        address currentDelegate = to;
        while (currentDelegate != address(0)) {
            require(currentDelegate != msg.sender, "Delegation loop detected");
            currentDelegate = voters[currentDelegate].delegate;
        }
        
        sender.delegate = to;
        Voter storage delegate_ = voters[to];
        
        // If the delegate already voted, add to the vote count
        if (delegate_.hasVoted) {
            for (uint i = 0; i < proposals.length; i++) {
                Proposal storage p = proposals[i];
                if (delegate_.proposalVotes[p.proposalHash]) {
                    if (delegate_.vote == uint8(VoteOption.For)) {
                        p.votesFor += sender.weight;
                    } else if (delegate_.vote == uint8(VoteOption.Against)) {
                        p.votesAgainst += sender.weight;
                    } else {
                        p.votesAbstain += sender.weight;
                    }
                }
            }
        } else {
            // Add to the delegate's weight
            delegate_.weight += sender.weight;
        }
        
        emit Delegated(msg.sender, to);
    }

    /**
     * @dev Cast a vote on a proposal
     * @param proposalId ID of the proposal
     * @param voteOption The vote (0 = Against, 1 = For, 2 = Abstain)
     */
    function vote(uint256 proposalId, VoteOption voteOption) 
        external 
        onlyRegistered 
        proposalActive(proposalId) 
    {
        Voter storage sender = voters[msg.sender];
        require(sender.weight > 0, "You have no voting rights");
        require(!sender.hasVoted, "You already voted");
        require(sender.delegate == address(0), "You delegated your vote");
        
        Proposal storage proposal = proposals[proposalId];
        require(!sender.proposalVotes[proposal.proposalHash], "You already voted on this proposal");
        
        sender.hasVoted = true;
        sender.vote = uint8(voteOption);
        sender.proposalVotes[proposal.proposalHash] = true;
        
        // Record the vote
        if (voteOption == VoteOption.For) {
            proposal.votesFor += sender.weight;
        } else if (voteOption == VoteOption.Against) {
            proposal.votesAgainst += sender.weight;
        } else {
            proposal.votesAbstain += sender.weight;
        }
        
        // Add voter to the list of voters for this proposal
        proposal.voters.push(msg.sender);
        
        emit VoteCast(msg.sender, proposalId, voteOption);
    }

    /**
     * @dev Execute a proposal after voting ends
     * @param proposalId ID of the proposal
     */
    function executeProposal(uint256 proposalId) external onlyAdmin {
        require(proposalId < proposals.length, "Proposal does not exist");
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp > proposal.endTime, "Voting period has not ended");
        require(!proposal.executed, "Proposal already executed");
        
        proposal.executed = true;
        emit ProposalExecuted(proposalId);
        
        // Implementation of proposal execution would go here
        // This could include transferring funds, changing contract state, etc.
    }

    /**
     * @dev Get the result of a proposal
     * @param proposalId ID of the proposal
     * @return votesFor, votesAgainst, votesAbstain, and whether the proposal passed
     */
    function getProposalResult(uint256 proposalId) 
        external 
        view 
        returns (uint256, uint256, uint256, bool) 
    {
        require(proposalId < proposals.length, "Proposal does not exist");
        Proposal storage proposal = proposals[proposalId];
        require(block.timestamp > proposal.endTime, "Voting period has not ended");
        
        bool passed = proposal.votesFor > proposal.votesAgainst;
        return (proposal.votesFor, proposal.votesAgainst, proposal.votesAbstain, passed);
    }

    /**
     * @dev Get a proposal's details
     * @param proposalId ID of the proposal
     * @return The proposal's title, description, start and end times, and execution status
     */
    function getProposalDetails(uint256 proposalId) 
        external 
        view 
        returns (string memory, string memory, uint256, uint256, bool) 
    {
        require(proposalId < proposals.length, "Proposal does not exist");
        Proposal storage proposal = proposals[proposalId];
        
        return (
            proposal.title,
            proposal.description,
            proposal.startTime,
            proposal.endTime,
            proposal.executed
        );
    }

    /**
     * @dev Get the number of proposals
     * @return The number of proposals
     */
    function getProposalCount() external view returns (uint256) {
        return proposals.length;
    }

    /**
     * @dev Check if a voter has voted on a specific proposal
     * @param voter The voter's address
     * @param proposalId ID of the proposal
     * @return Whether the voter has voted on this proposal
     */
    function hasVotedOnProposal(address voter, uint256 proposalId) 
        external 
        view 
        returns (bool) 
    {
        require(proposalId < proposals.length, "Proposal does not exist");
        return voters[voter].proposalVotes[proposals[proposalId].proposalHash];
    }

    /**
     * @dev Get a list of voters who voted on a proposal
     * @param proposalId ID of the proposal
     * @return Array of voter addresses
     */
    function getProposalVoters(uint256 proposalId) 
        external 
        view 
        returns (address[] memory) 
    {
        require(proposalId < proposals.length, "Proposal does not exist");
        return proposals[proposalId].voters;
    }
} 