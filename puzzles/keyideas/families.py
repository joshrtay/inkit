"""The fixed list of technique families a key idea is filed under (level a).

Seeded from three vocabularies so no domain owns the list: competition-math technique names
(AoPS), our solver's deduction kinds for grid puzzles, and Lichess's puzzle themes. Each family is
described without domain nouns where it can be, so a chess tactic and a grid deduction can share one.
"""
FAMILIES = {
    # counting and structure
    'parity': 'an odd/even count or alternation forces or forbids an outcome',
    'colouring': 'colour or label the parts so a pattern of colours rules something out',
    'invariant': 'a quantity no allowed operation changes, so unreachable states are ruled out',
    'monovariant': 'a quantity that only moves one way, so a process must end or cannot cycle',
    'pigeonhole': 'more items than places, so two share a place (or a place gets enough)',
    'extremal': 'look at the largest, smallest, first or last element and argue from it',
    'double-counting': 'count one total two ways and equate them',
    'bijection': 'match the objects one-to-one with easier objects',
    'complementary-counting': 'count or reason about what is excluded instead',
    'inclusion-exclusion': 'add overlaps back and take double-counted ones away',
    'symmetry': 'use a symmetry, mirror or reflection to reduce or copy the work',
    'recursion-induction': 'build the answer from smaller cases of the same problem',
    'working-backwards': 'start from the goal or end state and reason toward the start',
    'decomposition': 'split into independent parts and solve each',
    'reformulation': 'change representation: substitute, model as a graph, use coordinates',
    'bounding': 'show an upper and a lower limit meet, or a budget is exactly used up',
    'resource-budget': 'the totals must come out exactly, so the remaining choices are fixed',
    'optimization-exchange': 'improve any candidate by a swap until it is the best one',
    'construction': 'build an explicit example that meets the conditions',
    # deduction
    'casework': 'split into a few exhaustive cases and handle each',
    'contradiction': 'assume an option and follow it until it breaks a rule',
    'forcing-chain': 'one forced consequence triggers the next, in a chain',
    'elimination': 'every option but one is ruled out, so the last must hold',
    'saturation': 'a constraint is already exactly met, so everything else it touches is blocked',
    'only-place': 'a requirement has exactly one place left where it can be met',
    'uniqueness': 'the answer must be unique, so a choice that would allow two answers is wrong',
    'connectivity': 'parts must stay connected (or must not close a loop), which forces links',
    'boundary-effect': 'edges and corners have fewer options, so they are decided first',
    'interaction': 'two constraints overlap; neither decides alone, together they do',
    # number and algebra
    'modular-arithmetic': 'reason with remainders',
    'divisibility-factoring': 'factor or use divisibility and primes',
    'algebraic-identity': 'rewrite with an identity, complete a square, or telescope',
    'inequality': 'apply a standard inequality (AM-GM, Cauchy, ordering)',
    'functional-substitution': 'plug special values into a rule to pin it down',
    'recurrence': 'set up and solve a recurrence',
    'probability-expectation': 'linearity of expectation or a probability argument',
    'geometry-angles-similarity': 'angle chasing, similar or congruent figures',
    'geometry-lengths-areas': 'length and area relations (Pythagoras, power of a point, areas)',
    'calculation': 'mostly direct computation once set up',
    # adversarial (chess and games)
    'double-threat': 'make two threats at once; the opponent can answer only one',
    'overload': 'one defender has two duties and cannot do both',
    'deflection-decoy': 'force a defender away from, or onto, a key spot',
    'pin-skewer': 'attack along a line so a piece cannot move, or must move and expose another',
    'discovery': 'moving one unit unmasks an attack by another',
    'interference-clearance': 'block a line between enemy units, or clear a line for your own',
    'confinement': 'take away every escape option, then attack',
    'sacrifice': 'give up material to gain something bigger',
    'tempo-zugzwang': 'win by time: the opponent must move and every move hurts, or a race is won by a move',
    'promotion-race': 'push an advantage that will become decisive if not stopped',
    'defensive-resource': 'a hidden reply that saves or turns the position (stalemate, perpetual, counterattack)',
    'other': 'none of these fits',
}
