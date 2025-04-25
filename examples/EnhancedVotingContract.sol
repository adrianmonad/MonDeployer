// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title EnhancedVoting
 * @dev An enhanced contract for voting on proposals with voting deadline and delegation
 */
contract EnhancedVoting {
    // Structure for a proposal
    struct Proposal {
        string name;
        string description;
        uint voteCount;
    }

    // Structure for a voter
    struct Voter {
        bool hasVoted;
        uint proposalIndex;
        address delegate;
        uint weight;
    }

    // Address of the contract creator
    address public chairperson;
    
    // Voting end time
    uint public votingEndTime;
    
    // Mapping of voter addresses to voter details
    mapping(address => Voter) public voters;
    
    // Array of proposals
    Proposal[] public proposals;
    
    // Events
    event VoteCast(address indexed voter, uint proposalIndex);
    event VotingEnded(uint winningProposalIndex, string winningProposalName);
    event VoterDelegated(address indexed from, address indexed to);
    
    // Custom error for voting period ended
    error VotingPeriodEnded();
    // Custom error for unauthorized action
    error Unauthorized();
    // Custom error for invalid operation
    error InvalidOperation(string reason);
    
    /**
     * @dev Modifier to check if voting period is active
     */
    modifier votingActive() {
        if (block.timestamp > votingEndTime) {
            revert VotingPeriodEnded();
        }
        _;
    }
    
    /**
     * @dev Modifier to check if caller is chairperson
     */
    modifier onlyChairperson() {
        if (msg.sender != chairperson) {
            revert Unauthorized();
        }
        _;
    }
    
    /**
     * @dev Constructor to create a new voting contract with initial proposals
     * @param proposalNames Names of the proposals
     * @param proposalDescriptions Descriptions of the proposals
     * @param votingDurationInMinutes Duration of the voting period in minutes
     */
    constructor(
        string[] memory proposalNames,
        string[] memory proposalDescriptions,
        uint votingDurationInMinutes
    ) {
        require(proposalNames.length == proposalDescriptions.length, "Proposal names and descriptions must match");
        require(proposalNames.length > 0, "At least one proposal is required");
        
        chairperson = msg.sender;
        votingEndTime = block.timestamp + (votingDurationInMinutes * 1 minutes);
        
        // Give chairperson initial voting weight of 1
        voters[chairperson].weight = 1;
        
        // Create a proposal for each provided name
        for (uint i = 0; i < proposalNames.length; i++) {
            proposals.push(Proposal({
                name: proposalNames[i],
                description: proposalDescriptions[i],
                voteCount: 0
            }));
        }
    }
    
    /**
     * @dev Grant voting rights to an address
     * @param voter Address to grant voting rights to
     */
    function giveRightToVote(address voter) public onlyChairperson votingActive {
        if (voters[voter].weight != 0 || voter == chairperson) {
            revert InvalidOperation("Voter already has voting rights");
        }
        voters[voter].weight = 1;
    }
    
    /**
     * @dev Delegate vote to another address
     * @param to Address to delegate vote to
     */
    function delegate(address to) public votingActive {
        Voter storage sender = voters[msg.sender];
        
        if (sender.weight == 0) {
            revert InvalidOperation("You have no right to vote");
        }
        
        if (sender.hasVoted) {
            revert InvalidOperation("You already voted");
        }
        
        if (to == msg.sender) {
            revert InvalidOperation("Self-delegation is not allowed");
        }
        
        // Forward delegation if delegate already delegated
        while (voters[to].delegate != address(0) && voters[to].delegate != msg.sender) {
            to = voters[to].delegate;
        }
        
        // Check for circular delegation
        if (voters[to].delegate == msg.sender) {
            revert InvalidOperation("Circular delegation detected");
        }
        
        sender.hasVoted = true;
        sender.delegate = to;
        
        Voter storage delegateTo = voters[to];
        
        if (delegateTo.hasVoted) {
            // If the delegate already voted, add votes to their choice
            proposals[delegateTo.proposalIndex].voteCount += sender.weight;
        } else {
            // If delegate hasn't voted yet, add to their weight
            delegateTo.weight += sender.weight;
        }
        
        emit VoterDelegated(msg.sender, to);
    }
    
    /**
     * @dev Cast a vote for a proposal
     * @param proposalIndex Index of the proposal to vote for
     */
    function vote(uint proposalIndex) public votingActive {
        Voter storage sender = voters[msg.sender];
        
        if (sender.weight == 0) {
            revert InvalidOperation("You have no right to vote");
        }
        
        if (sender.hasVoted) {
            revert InvalidOperation("You already voted");
        }
        
        if (proposalIndex >= proposals.length) {
            revert InvalidOperation("Invalid proposal index");
        }
        
        sender.hasVoted = true;
        sender.proposalIndex = proposalIndex;
        
        // Add sender's weight to the proposal's vote count
        proposals[proposalIndex].voteCount += sender.weight;
        
        emit VoteCast(msg.sender, proposalIndex);
    }
    
    /**
     * @dev End voting period before deadline (only chairperson)
     */
    function endVotingEarly() public onlyChairperson {
        votingEndTime = block.timestamp;
        uint winningIndex = winningProposal();
        emit VotingEnded(winningIndex, proposals[winningIndex].name);
    }
    
    /**
     * @dev Get the winning proposal
     * @return winningProposal_ Index of the winning proposal
     */
    function winningProposal() public view returns (uint winningProposal_) {
        uint winningVoteCount = 0;
        
        // Find the proposal with the highest vote count
        for (uint p = 0; p < proposals.length; p++) {
            if (proposals[p].voteCount > winningVoteCount) {
                winningVoteCount = proposals[p].voteCount;
                winningProposal_ = p;
            }
        }
    }
    
    /**
     * @dev Get the name of the winning proposal
     * @return winnerName_ Name of the winning proposal
     */
    function winnerName() public view returns (string memory winnerName_) {
        winnerName_ = proposals[winningProposal()].name;
    }
    
    /**
     * @dev Get the number of proposals
     * @return Number of proposals
     */
    function getProposalCount() public view returns (uint) {
        return proposals.length;
    }
    
    /**
     * @dev Get information about a proposal
     * @param proposalIndex Index of the proposal
     * @return name Name of the proposal
     * @return description Description of the proposal
     * @return voteCount Number of votes for the proposal
     */
    function getProposal(uint proposalIndex) public view returns (
        string memory name, 
        string memory description, 
        uint voteCount
    ) {
        require(proposalIndex < proposals.length, "Invalid proposal index");
        Proposal storage proposal = proposals[proposalIndex];
        return (proposal.name, proposal.description, proposal.voteCount);
    }
    
    /**
     * @dev Check if voting period has ended
     * @return True if voting period has ended
     */
    function hasVotingEnded() public view returns (bool) {
        return block.timestamp > votingEndTime;
    }
    
    /**
     * @dev Get time remaining until voting ends
     * @return Time remaining in seconds (0 if voting has ended)
     */
    function votingTimeRemaining() public view returns (uint) {
        if (block.timestamp >= votingEndTime) {
            return 0;
        }
        return votingEndTime - block.timestamp;
    }
} 