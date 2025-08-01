## ETH → LTC Swap
-------------------------------------------

1. User generates a 32-byte secret `s` and computes the hash `h = SHA256(s)`

2. User creates a 1inch Fusion order (off-chain):
   - Specifies amount of ETH to sell and LTC to receive.
   - Includes `h` (e.g. via Fusion metadata or off-chain agreement).
   - Sets deadline, resolver fee, and other parameters.

3. User submits the signed order to a 1inch Fusion relayer.

4. Relayer broadcasts the order to all available resolvers.

5. A resolver decides to fill the order and:
   a. Accepts the Fusion order.
   b. Locks resolver’s ETH (if required) and executes the Fusion trade.
   c. ETH is sent to a resolver-claimable escrow contract (e.g. EscrowDst)

6. Resolver now constructs and broadcasts a Litecoin HTLC:
 - Uses `h` (shared by user in step 2)
   - Includes:
     - Resolver’s public key (to claim LTC with `s`).
     - User’s public key (for refund if resolver fails).
     - Timelock (for user refund).
   - Sends LTC to the P2SH address.

7. Resolver sends the LTC transaction and HTLC info to the user (via relayer).

8. User claims the LTC using secret `s` on Litecoin
   - Secret `s` is now revealed on-chain in the LTC txns.

9. Resolver watches the Litecoin blockchain for user claim
   - Extracts secret `s` from the LTC transaction.

10. Resolver uses secret `s` to claim ETH from the escrow contract on Ethereum.

## LTC -> ETH

1. User generates secret `s` and computes hash `h = SHA256(s)`

2. User creates and signs an off-chain order for 1inch Fusion (Ethereum):
   - Includes secret hash `h` (possibly in custom field or metadata).
   - Specifies the amount of ETH to receive, expiry, ........etc...
   Note: Does NOT specify a resolver — 1inch selects the winning one.

3. User submits order to 1inch Fusion via relayer API.

4. Resolvers receive order and decide whether to fill.

5. A resolver fills the order by sending ETH to the user (or escrow contract).

6. Relayer reveals to the user the identity (public key) of the winning resolver.

7. User constructs and broadcasts the Litecoin HTLC:
   - Uses the hash `h`, resolver’s public key, user’s pubkey, and timeout.
   - Sends LTC to resulting P2SH address.

8. Once resolver sees the LTC deposit, it notifies relayer.

9. User claims ETH using `s` → `s` is revealed on Ethereum.

10. Resolver uses `s` to claim LTC from the HTLC address.