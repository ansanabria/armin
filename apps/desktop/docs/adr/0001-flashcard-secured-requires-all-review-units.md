# A flashcard is secured only when all of its review units are secured

A prerequisite flashcard unlocks its dependents only once **every** review unit it
generates is secured (FSRS `Review` state with stability ≥ the configured floor) —
not when any single review unit is. We chose the all-units rule over "any unit" or
"primary direction only" because a flashcard's review units represent distinct
recall directions (e.g. forward and reverse of a reversed flashcard, or each cloze
deletion), and a dependent should not unlock while a learner still fails one of
those directions.

Consequence: a flashcard with one rock-solid direction and one weak direction
stays unsecured, keeping its dependents locked until the weak direction crosses
the floor. This is intentional.
