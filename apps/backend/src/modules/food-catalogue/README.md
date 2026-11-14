# Food catalogue

Fixed application reference data for the 14 EU Annex II allergen groups and the
separate halal, chili and garlic labels (ADR-0012). This module owns no dishes,
Restaurant participation, declarations or historical Order facts.

## Models and boundaries

- `Allergen`: generated `alg_*` identity, unique stable `code`, unique business
  `number` 1–14, Danish/English names and descriptions. Checks enforce the
  reviewed code/number pairing and nonblank translations.
- `AllergenDetail`: generated `ald_*` identity, unique stable code, bilingual
  name and `parent_number`. Wheat, spelt, khorasan wheat, rye, barley, oats and
  hybridised cereals belong to group 1; the eight named nuts belong to group 8.
  Database checks reject unknown or misplaced codes. A foreign key rejects an
  absent group. The additional migration declares this business-key foreign key
  because Medusa DML relations target internal IDs.
- `FoodLabel`: generated `flb_*` identity, fixed unique code `halal`, `chili` or
  `garlic`, bilingual names and descriptions. There is no allergen number.

The installed framework 2.22.4 documents `model`, `MedusaService`, custom modules
and module links. Reference data belongs in its own module rather than Product
metadata or Restaurant-owned rows. Details stay inside this module, so their
foreign key is local. No commerce link is needed for a read-only catalogue.
Later declaration workflows should link their owning module to these stable
records through Medusa module links; custom modules must not import each other.
The catalogue is global, so its reads do not depend on a Restaurant being active
or open. Partner reads still check current staff authorization on every request.

## Setup and preservation

Normal `medusa db:migrate` runs `src/migration-scripts/food-catalogue.ts`, which
executes `seedFoodCatalogueWorkflow`. It runs independently of optional demo data
and seeds groups before details and labels, with compensation for each insert.
The shared seed lock serializes competing runs. The fixed reviewed data lives in
`data/catalogue.json`; the partner app reads database records rather than importing
this file. Repeating the workflow adds only missing codes, never updates,
renumbers, deletes or replaces existing records. Names are not identity keys.
No catalogue mutation API or administration screen exists. A future correction
requires a reviewed migration that preserves IDs and existing references.

This slice introduces no dish declaration persistence. The future declaration
contract must distinguish Contains, May contain, Unknown and explicitly none
declared, plus separate Yes/No/Unknown food labels. An empty list is never an
allergen-free assertion. Neither the catalogue nor its legend declares anything
about a particular dish. Halal is the Restaurant's declaration, not certification.

## Source review

Names, the eight nuts (including Brazil nuts), cereal details, exceptions and
sulphite qualifications were reviewed against
[Regulation 1169/2011, Annex II](https://eur-lex.europa.eu/eli/reg/2011/1169/oj/eng),
its [Danish text](https://eur-lex.europa.eu/legal-content/DA/TXT/PDF/?uri=CELEX:32011R1169)
and the [published Annex II text](https://www.legislation.gov.uk/eur/2011/1169/annex/II).
The descriptions are bilingual summaries, not a replacement for the source.
Sulphites concern more than 10 mg/kg **or** 10 mg/litre total SO2 in the food ready
to consume or reconstituted according to instructions. Cereals, fish, soy, milk
and nuts retain their listed exceptions. Spelt and khorasan wheat are types of
wheat, not extra EU groups. Stable detail codes are local reference identities,
not official EU numbering.

## Read contracts and evidence

See the API README for `/store/food-catalogue` and `/partner/food-catalogue`.
The initial-data/HTTP suite `integration-tests/http/food-catalogue.spec.ts` uses
an empty disposable application database and verifies repeated setup, bilingual
reads, number and detail constraints, and staff/actor access. A pre-existing
commerce record with reference IDs in fixture metadata is read through Admin
before and after reseeding; its references and the full catalogue stay unchanged.
This fixture is not the later dish declaration storage contract. The partner browser
journey verifies normal migration seeding through the production harness,
Danish/English, local symbol loading, keyboard disclosures and narrow/wide layouts.
No events are emitted by catalogue reads or setup.
