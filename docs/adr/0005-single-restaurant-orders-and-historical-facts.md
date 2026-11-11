# Each Order belongs to one Restaurant location

Agreed on 11 November 2026 in the issue #10 domain review. A Restaurant represents one food preparation and pickup location, including a catering business operating that way; separate branches are separate Restaurants. An Order belongs to one Customer, exactly one Restaurant and one delivery destination, with one intended delivery, so a purchase from another Restaurant requires a separate Order rather than coordinated fulfilment across locations.

Ordered names, quantities, prices and the destination remain historical facts when menus or saved addresses change. Payment retries and unsuccessful delivery attempts must not silently create additional purchases. ADR-0009 and ADR-0011 record payment timing and failure outcomes; detailed payment relationships remain to be agreed.
