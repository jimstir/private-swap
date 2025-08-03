import React, { useState } from 'react';
import './App.css';
import SignSendSection from './SignSendSection';

function App() {
  const [account, setAccount] = useState(null);
  const [error, setError] = useState(null);
  const [network, setNetwork] = useState(null);

  // Connect to MetaMask
  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      setError('MetaMask is not installed.');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setAccount(accounts[0]);
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      setNetwork(chainId);
      setError(null);
    } catch (err) {
      setError('Failed to connect: ' + err.message);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h2>Litecoin-Ethereum Atomic Swap (MetaMask UI)</h2>
        {!account ? (
          <button onClick={connectWallet}>Connect MetaMask</button>
        ) : (
          <>
            <div>Connected: <b>{account}</b></div>
            <div>Network Chain ID: <b>{network}</b></div>
          </>
        )}
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <div style={{ marginTop: 32 }}>
          <h3>MetaMask Signing / Transaction Actions</h3>
          <p>Paste the data you are asked to sign or send below. Choose the action, and MetaMask will prompt you. Copy the result back to the backend when needed.</p>
          <SignSendSection account={account} />
        </div>
      </header>
    </div>
  );
}

export default App;
