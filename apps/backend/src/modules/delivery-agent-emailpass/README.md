# Delivery agent email/password provider

This provider uses Medusa's email/password implementation in its own namespace,
separate from Customer, Restaurant staff and operator credentials. Registration
requires the current invitation token and the matching email. A new invitation
can set a fresh password for an inactive identity. A credential alone
never authorizes access. The delivery module and partner endpoints check the
agent's durable status on every workspace request.
