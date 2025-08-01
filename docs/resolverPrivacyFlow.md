PHASE 1: Resolver Signup & Wallet Setup

on LTC:
1. Create MWEB Wallet ( Bank Account)
   - Acts as resolver's private LTC vault

2. Create Transparent LTC Wallet
   - For sending LTC to HTLC P2SH addresses

on ETH:
3. Set Up Railgun Private Wallet
   - Deploy or generate a Railgun private wallet
   - Deposit ETH into Railgun shielded balance

4. Create Worker Wallets (Ethereum)
   - Each worker is a hot wallet that submits signed fills on-chain
   - Must be funded to pay gas (ETH)
   - Replenished from Railgun wallet, the amount based on the preference of the resolver for filling orders.

---

PHASE 2: Funding & Replenishment

[LTC]
5. Deposit LTC into MWEB wallet
   - From external address or faucet

6. Replenish Transparent Wallet when needed
   - Move LTC from MWEB → Transparent
   - Use it to fund P2SH HTLCs per swap

[ETH]
7. Shield ETH into Railgun Private Balance
   - Use Railgun SDK or app to deposit ETH privately

8. Monitor Worker Wallet Balances
   - If worker ETH < threshold, unshield funds from Railgun to worker
   - Use unique addresses to maintain unlinkability

PHASE 3: Swap Execution

[When Resolver Wins a Fusion Order]

[LTC SIDE]
9. Create HTLC Script:
   - Uses `hash(h)`, resolver pubkey, timelock
   - Funded from Transparent LTC wallet
   - LTC comes from MWEB originally

[ETH SIDE]
10. Fill the Fusion Order:
    - Worker wallet signs & submits fill tx
    - ETH transferred to EscrowDst / user
    - Replenish gas & ETH from Railgun