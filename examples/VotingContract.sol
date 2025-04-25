// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title SimpleVoting
 * @dev A simple contract for voting on proposals
 */
contract SimpleVoting {
    // Structure for a proposal
    struct Proposal {
        string name;
        uint voteCount;
    }

    // Address of the contract creator
    address public chairperson;
    
    // Mapping of voter addresses to whether they have voted
    mapping(address => bool) public voters;
    
    // Array of proposals
    Proposal[] public proposals;
    
    // Event emitted when a vote is cast
    event VoteCast(address indexed voter, uint proposalIndex);
    
    /**
     * @dev Constructor to create a new voting contract with initial proposals
     * @param proposalNames Names of the proposals
     */
    constructor(string[] memory proposalNames) {
        chairperson = msg.sender;
        
        // Create a proposal for each provided name
        for (uint i = 0; i < proposalNames.length; i++) {
            proposals.push(Proposal({
                name: proposalNames[i],
                voteCount: 0
            }));
        }
    }
    
    /**
     * @dev Cast a vote for a proposal
     * @param proposalIndex Index of the proposal to vote for
     */
    function vote(uint proposalIndex) public {
        // Check if the voter has already voted
        require(!voters[msg.sender], "Already voted.");
        
        // Check if the proposal index is valid
        require(proposalIndex < proposals.length, "Invalid proposal.");
        
        // Mark the sender as having voted
        voters[msg.sender] = true;
        
        // Increment the vote count for the proposal
        proposals[proposalIndex].voteCount++;
        
        // Emit the vote event
        emit VoteCast(msg.sender, proposalIndex);
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
     * @return voteCount Number of votes for the proposal
     */
    function getProposal(uint proposalIndex) public view returns (string memory name, uint voteCount) {
        require(proposalIndex < proposals.length, "Invalid proposal.");
        Proposal storage proposal = proposals[proposalIndex];
        return (proposal.name, proposal.voteCount);
    }
} 