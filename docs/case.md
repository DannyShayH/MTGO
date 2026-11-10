# MTOGO case

The project case from Erhvervsakademi København, transcribed from the assignment PDF. It describes the requirements for both the software solution and the development process. This file is the source that AI agents and the team read; keep it in line with the assignment and do not add our own decisions here (those belong in `docs/adr/` and `GLOSSARY.md`).

## Problem definition

The team is responsible for a project on behalf of a food delivery business. Each team works separately on the same problem.

The task is to design, develop, implement and deploy a software system that provides business services and automates business processes.

## Development process

The team must use Kanban, DevOps and Continuous Delivery principles as described in this document. Having learned to work iteratively in the previous Scrum project, the team now uses Kanban to visualize and improve its workflow. DevOps is about rolling out changes safely and learning from the system in production. Continuous Delivery is the technical capability to continuously have tested changes ready for deployment.

## Scenario

The customer is MTOGO, a national provider of food delivery services operating in multiple languages (currently English and Danish). Customers have personal accounts and can place orders through the MTOGO website, mobile app or telephone ordering service.

The food is prepared and delivered by restaurants and food businesses according to their own menu. The menu can be viewed on the MTOGO website or mobile app, but MTOGO does not take part in selecting it, only in displaying it. MTOGO provides the platform for ordering and delivery but does not determine the restaurants' menu offerings.

### Business model and fees

Restaurants pay MTOGO a service fee and a variable commission based on the total order value excluding VAT. The commission rate decreases as the order value increases, from a base of 6% for orders below 101 DKK to 3% for orders over 1,000 DKK. The business has not agreed on a way to model the sliding scale of fees.

It could for example be:

- First 100 DKK: 6%
- Amount up to 500 DKK: 5%
- Amount up to 1,000 DKK: 4%
- Anything more: 3%

The team can choose this model or a more advanced calculation that reduces the fee gradually rather than in such big steps. Customers do not pay a delivery charge, so all menu prices include free delivery.

### Delivery agents and bonus

MTOGO employs local delivery agents who collect food from restaurants and deliver it to customers. Following a recent court ruling under European human rights law, these agents are now classified as employees and are therefore eligible for performance-based bonuses.

Bonuses may be awarded based on factors such as the total value of delivered orders, working during early or late hours, and customer ratings. The team must design and implement a bonus system, including the rules for when bonuses are awarded and how they are calculated.

The team is free to define the bonus structure and amounts. However, the system must take MTOGO's revenue into account and ensure that the bonus scheme remains financially sustainable for the company.

### Order tracking and notifications

Customers receive updates either by SMS or via the MTOGO app as their order progresses through preparation and delivery.

All payments are made with the order, and the delivery agents do not handle payment at all. Payment processing is provided by an outside supplier. Integration with it is not required, but the team could mock calling the service and its responses.

After delivery, customers receive a feedback request. It includes a rating for the food, the overall experience and the individual delivery person.

### Management dashboard

Management wants a dashboard of order status, for example the number of open orders, average orders over 24-hour periods and the average time to process an order.

### Future extension: complaint management

MTOGO currently handles customer and supplier complaints outside the application, but plans to introduce a complaint management system in the future. It should support complaints from both customers and suppliers (for example restaurants and catering businesses).

Implementing complaint management is not part of the current project. However, the system should be designed with modularity and extensibility in mind, so new functionality can be added without major changes to existing components.

### Business growth

MTOGO currently serves approximately 30,000 customers and processes around 120,000 orders a year. Over the next five years the company expects to grow to 50,000 customers and an estimated 200,000 orders a year.

The system should support the company's daily operations and provide a reliable foundation for its continued growth.

## Project requirements and development practices

### Shared project ambition

The goal is a development process that lets the team deliver small, tested and reliable software changes frequently, while continuously improving its workflow.

Kanban, DevOps and Continuous Delivery are complementary practices. The objective is not to adopt as many tools as possible, but to make deliberate choices that support reliable software delivery and continuous improvement.

### Core requirements: Kanban

- Visualize the team's workflow and maintain a prioritized backlog in GitHub Projects.
- Apply WIP limits and a pull-based approach to manage the flow of work.
- Monitor WIP, cycle time and throughput to identify bottlenecks and improvement opportunities.
- Conduct weekly flow reviews, experiment with improvements, and briefly document decisions and results.

### Core requirements: engineering and collaboration

- Practice trunk-based development with short-lived branches, frequent integration into main and automated quality checks. Keep main stable and potentially deployable.
- Use automated build and test checks as part of continuous integration.
- Maintain traceability between issues, pull requests (if used) and integrated changes.
- Define and document explicit team policies, including a Definition of Done and a justified code review policy.

| Policy             | Guiding question                                             |
| ------------------ | ------------------------------------------------------------ |
| Workflow           | When can an issue move between workflow stages?              |
| WIP                | How are WIP limits and blocked work handled?                 |
| Definition of Done | When is a feature considered complete?                       |
| Quality            | Which automated checks must pass?                            |
| Collaboration      | How are pull requests, code reviews and integration handled? |

### DevOps and Continuous Delivery

The team is expected to establish a working foundation for reliable software delivery: automated build and tests, frequent integration, a repeatable deployment approach and the ability to demonstrate the current application.

Use Semantic Versioning when producing releases and explain the chosen release practice.

### Optional practices

Teams select additional practices according to their progress, capabilities and ambitions. The topics below are a menu of extensions, not a checklist of mandatory features.

- **Deployment strategies:** compare and, where feasible, implement a deployment approach that reduces interruption and risk.
- **Feature flags:** use flags to separate deployment from feature release where useful.
- **Logging and monitoring:** introduce application logs, metrics and dashboards, for example with Grafana.
- **Infrastructure as Code:** start with Docker Compose; explore Terraform where infrastructure provisioning makes sense.
- **DORA metrics:** explore delivery performance and reliability metrics and interpret them in the context of the team and project.
- **Database migrations:** use Flyway to version and apply schema changes.
- **Additional tooling:** consider Dependabot, SBOM, CODEOWNERS, advanced quality gates or architecture checks such as ArchUnit when they address a real need.

### Decisions, evidence and demonstrations

Document important process and technical decisions in the repository. Record weekly flow-review observations, improvement decisions and any follow-up on experiments. Short notes are sufficient.

Be prepared to demonstrate the following at weekly supervision meetings:

- A working increment of the application.
- The current Kanban board, flow metrics and examples of workflow improvements.
- CI pipeline results, including automated build and tests.
- Results from static code analysis and code coverage, including any configured quality gates.

Explain what has been implemented, what remains incomplete, and why the team prioritized its chosen practices and features.

### Scope and differentiation

Teams are not expected to implement every possible business feature or every advanced DevOps practice. Prioritize a coherent, working subset of MTOGO functionality and a dependable delivery process. More advanced teams may extend the product and engineering practices. Depth, justified decisions, demonstrable results and reflection matter more than the number of tools introduced.
