import React, { useState } from 'react';

export default function SignSendSection({ account }) {
  const [input, setInput] = useState('');
  const [action, setAction] = useState('sign');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAction = async () => {
    setLoading(true);
    setError('');
    setResult('');
    try {
      if (!window.ethereum) throw new Error('MetaMask not available');
      let data;
      try {
        data = JSON.parse(input);
      } catch (e) {
        throw new Error('Invalid JSON');
      }
      let res;
      if (action === 'sign') {
        // EIP-712 Typed Data
        if (data.domain && data.types && data.message) {
          res = await window.ethereum.request({
            method: 'eth_signTypedData_v4',
            params: [account, JSON.stringify(data)],
          });
        } else if (typeof data === 'string') {
          // Simple message
          res = await window.ethereum.request({
            method: 'personal_sign',
            params: [data, account],
          });
        } else {
          throw new Error('Provide EIP-712 object or string message');
        }
      } else if (action === 'send') {
        // Send transaction
        res = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [data],
        });
      }
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#222', padding: 16, borderRadius: 8, maxWidth: 480, margin: '0 auto' }}>
      <textarea
        rows={8}
        style={{ width: '100%', fontFamily: 'monospace', marginBottom: 8 }}
        placeholder={`Paste EIP-712 object, message, or tx JSON here`}
        value={input}
        onChange={e => setInput(e.target.value)}
        disabled={loading}
      />
      <div style={{ marginBottom: 8 }}>
        <label>
          <input
            type="radio"
            name="action"
            value="sign"
            checked={action === 'sign'}
            onChange={() => setAction('sign')}
            disabled={loading}
          />{' '}
          Sign (EIP-712 or message)
        </label>
        <label style={{ marginLeft: 16 }}>
          <input
            type="radio"
            name="action"
            value="send"
            checked={action === 'send'}
            onChange={() => setAction('send')}
            disabled={loading}
          />{' '}
          Send Transaction
        </label>
      </div>
      <button onClick={handleAction} disabled={loading || !input || !account}>
        {loading ? 'Processing...' : action === 'sign' ? 'Sign' : 'Send'}
      </button>
      {result && (
        <div style={{ marginTop: 16, color: '#0f0', wordBreak: 'break-all' }}>
          <b>Result:</b>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{result}</pre>
        </div>
      )}
      {error && (
        <div style={{ marginTop: 16, color: 'red' }}>{error}</div>
      )}
    </div>
  );
}
