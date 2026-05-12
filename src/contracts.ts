export const CRONUS_ABI = [
  {
    "inputs": [
      {"internalType": "string", "name": "topic", "type": "string"},
      {"internalType": "string", "name": "decision", "type": "string"},
      {"internalType": "uint8", "name": "agentId", "type": "uint8"},
      {"internalType": "uint256", "name": "confidence", "type": "uint256"}
    ],
    "name": "logDecision",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getDecisionsCount",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getMyDecisions",
    "outputs": [{"internalType": "uint256[]", "name": "", "type": "uint256[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "oracle", "type": "address"},
      {"indexed": false, "internalType": "string", "name": "topic", "type": "string"},
      {"indexed": false, "internalType": "string", "name": "decision", "type": "string"},
      {"indexed": false, "internalType": "uint8", "name": "agentId", "type": "uint8"},
      {"indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256"}
    ],
    "name": "DecisionLogged",
    "type": "event"
  }
]

export const DEPLOYED_CONTRACT = "0xd81a420BFa4CE8778473BD46195B8E97e928880f"
export const CONTRACT_ADDRESS_KEY = "cronus_contract_address"
