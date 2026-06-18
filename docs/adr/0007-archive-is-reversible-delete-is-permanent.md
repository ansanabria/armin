# Archive is the reversible tier; delete is permanent

Setting a flashcard aside has two distinct tiers. **Archive** is the reversible,
default path: content and FSRS history are preserved, the flashcard stays visible
in browse, it is excluded from review, and it is inert in the prerequisite graph
(see ADR 0003); unarchiving fully restores it. **Delete** is a permanent
hard-delete: the flashcard, its review units, and all their review-log history are
destroyed, its prerequisite edges are removed, and its dependents recompute and
unlock.

We deliberately do **not** add a trash/soft-delete tier — archive already is the
recoverable path, so a third tier would be redundant. Because delete's losses are
invisible and irreversible (months of FSRS history; the silent unlocking of
dependents that relied on this flashcard as a foundation), delete must show a
confirmation that names those consequences ("this flashcard has N dependents and N
of review history"). This applies the "honest, show the structure" principle to a
destructive action.

Consequence: deleting a prerequisite has the same unlocking effect on dependents
as archiving it, but unlike archive it cannot be undone — so the UI steers toward
archive as the default and reserves delete for genuine mistakes.
