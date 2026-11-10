# Glossary

Shared language for the whole repo. Use these terms in the UI, emails, and code comments.

## Purchase

A completed payment by a learner for a course, and the access it gives them. A purchase is not undone by asking for a refund. It stays in place while a refund request is under review.

Once a refund is approved, the purchase remains as the record of what was paid, but it no longer counts: the learner does not own the course until they buy it again. A learner owns a course when they have a purchase of it that has no approved refund.

## Amount paid

What the learner actually paid for the purchase, after any regional (purchasing-power) price or coupon. This is the amount we name everywhere a refund is mentioned. It is never the course's list price.

## Refund request

A learner's request to get their money back for a purchase. It asks for repayment of the amount paid and nothing else.

- It is a separate record that points at one purchase. It does not cancel, reverse, or change the purchase.
- Sending one is a request, not a guarantee. A person on our team reviews each one by hand.
- The learner keeps access to the course while the request is under review. Access ends when the request is approved, at the same moment the money goes back.
- Only an admin can approve or decline a request. The learner never decides their own, and neither does the course's instructor.
- An approved request always refunds the full amount paid. There are no partial refunds.
- A request is approved only once the money has actually been sent back. If sending it fails, the request stays under review.
- A request is decided once. After it is declined, the learner cannot send another for the same purchase.
- A learner whose earlier purchase of a course was refunded cannot request a refund on a later purchase of that course.
- Only a purchase with no team seats attached can be refunded.
- The learner is told the outcome, by email and on their settings page, whether approved or declined.
- A purchase has at most one request under review at a time.
- Stored in the `refunds` table; its status is `RefundStatus`.

### Refund request status

| Learner sees   | Stored as   | Meaning                                                                                                     |
| -------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| **Under review** | `requested` | We have recorded the request. No one has decided yet. No money has moved.                                   |
| **Approved**   | `approved`  | We gave the money back and the learner's access has ended. The amount refunded is recorded.                 |
| **Declined**   | `declined`  | We decided not to give the money back. Nothing is refunded.                                                 |

The settings page lists all three, so a learner always sees what became of their request.

## Course progress

What a learner has done in a course: lessons completed, video watched, quiz answers given. It belongs to the learner, not to the purchase.

- Sending a refund request does not touch it, and neither does a decline.
- An approved refund ends access but keeps the progress. If the learner buys the course again, they continue where they left off.

## Terms to avoid

| Don't say                       | Why                                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| Cancel purchase / cancellation  | Implies the purchase is undone. It is not; only a refund is being asked for.                 |
| Reversal                        | Accounting jargon that reads as already done and does not say money comes back.              |
| Chargeback                      | A dispute a cardholder files with their bank. A refund request goes to us, not to the bank.  |
| Pending                         | Does not say who the learner is waiting on. Use "Under review".                              |
