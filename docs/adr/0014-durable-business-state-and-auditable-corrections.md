# Preserve business guarantees across retries, restarts and corrections

Agreed on 11 November 2026 in the issue #10 domain review. Paid Orders, responsibilities and financial history survive restarts, and expired business deadlines are handled after recovery. Repeated submissions and competing claims preserve the agreed no-duplicate-payment and single-responsible-agent guarantees. Unauthorized users cannot access another party's information. Operator corrections retain an audit history, and failed payments, refunds and notifications remain visible until resolved.

These are acceptance requirements for the relevant Features; later Feature grills choose the implementation and verification. Each Feature needs documented user stories refined with an agent before implementation, with the agreed business rules preserved. The rules do not prescribe a storage mechanism or a particular recovery architecture.

## Exercise growth and performance baseline

Demonstrate twenty simultaneous user journeys, with ordinary browsing and status requests completing within two seconds for 95% of requests, and Order submission within five seconds when the mock payment service responds immediately. Verify management and financial reporting with synthetic data representing 50,000 Customers and 200,000 historical Orders. These are explicit school-project validation assumptions that can be tested and revisited, not a production capacity or service guarantee. Each Feature grill chooses the relevant setup and evidence.
