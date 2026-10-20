# PAYMENT POLICY — version 2.0-DRAFT

status: DRAFT  
effective_date: null (not published)  
applies_to: new contractor DEPOSIT payments after confirmation  
does_not_apply_to: legacy FULL_PAYMENT orders or legacy material deposits

## Contractor

- Accepted quote is snapshotted in VND integers.
- Deposit = 15% of quote total. BuildMate holds the whole 15% (mock ledger in this thesis).
- Platform fee = 5% of quote total, not 5% of the deposit.
- Contractor hold = 10% of quote total (deposit − fee).
- Remaining 85% is paid directly by the customer to the contractor off-platform and is not BuildMate revenue.
- Work may start only after DEPOSIT = PAID and escrow = HELD.
- Mock payout of the 10% and posting of the 5% happen only after: deposit paid, customer acceptance, 85% reconciled, no open dispute, admin settle, and the amount has not already been settled.

## Material store

- No platform deposit, commission, monthly fee, or escrow.
- Order total = goods + shipping. Settlement is COD / direct to the store.
- Material GMV is not BuildMate fee revenue.

## Mock

PAID / HELD / RELEASED / REFUNDED on this project are demo ledger states. They do not mean real money moved.
