// What the reading screen says while Claude reads a drawing (ReadingScreen.tsx): words for what
// it's doing, and one fact per read about puzzles and the people who make them.
//
// Facts must be true: add only ones you can stand behind (a source you'd cite), stated no more
// precisely than you're sure of.

/** Shown one at a time, slowly, with an ellipsis. */
export const WORDS = [
  "Parsing", "Clauding", "Deciphering", "Squinting", "Pondering", "Tracing", "Tallying", "Untangling",
  "Decoding", "Scrutinizing", "Noodling", "Puzzling", "Cogitating", "Mulling", "Gridding", "Sleuthing",
  "Inspecting", "Unscrambling", "Transcribing", "Ruminating", "Contemplating", "Deliberating", "Penciling",
  "Peering", "Interpreting", "Divining", "Tinkering", "Pattern-matching", "Cross-referencing", "Double-checking",
  "Musing", "Reckoning", "Surveying", "Discerning", "Percolating", "Marinating", "Brewing", "Counting squares",
  "Hypothesizing", "Deducing", "Inferring", "Mapping", "Enumerating", "Squaring up", "Unsmudging", "Ciphering",
  "Corner-checking", "Line-following", "Clue-hunting", "Doodle-sorting", "Pencil-reading", "Wobble-forgiving",
  "Grid-straightening", "Number-spotting", "Head-scratching", "Chin-stroking", "Brain-wrinkling", "Ink-reading",
  "Mind-mapping", "Ponderating", "Figuring", "Working it out", "Connecting the dots", "Minding the gaps",
  "Reading between the lines", "Lining things up", "Thinking it through", "Considering every square",
];

/** One per read. */
export const FACTS = [
  // Martin Gardner and the recreational maths world
  "Martin Gardner wrote the Mathematical Games column in Scientific American for 25 years, from 1956 to 1981.",
  "Martin Gardner's first Scientific American column was about hexaflexagons: folded paper strips that flip to show hidden faces.",
  "Hexaflexagons were discovered in 1939 by Arthur Stone, a student at Princeton, while folding strips of paper trimmed from his notebook.",
  "Martin Gardner never studied mathematics after high school, yet became one of the best-loved writers about it.",
  "Martin Gardner's October 1970 column introduced readers to John Conway's Game of Life.",
  "Martin Gardner's January 1977 column introduced Penrose tiles, which cover a floor without ever repeating, to the public.",
  "The RSA code that protects much of the internet was first described to the public in Martin Gardner's August 1977 column, with a coded challenge that took 17 years to crack.",
  "For April Fools' Day 1975, Martin Gardner claimed to have found a map that needs five colors. It was a joke: four colors are always enough.",
  "Every two years, puzzle makers, magicians and mathematicians meet at the Gathering 4 Gardner, in his honor.",
  "Solomon Golomb coined the word polyomino in 1953; Martin Gardner's columns made pentominoes famous.",
  "Piet Hein invented the Soma cube in 1933: seven pieces that fit together into a 3 by 3 by 3 cube in hundreds of ways.",
  "The game of Hex was invented by Piet Hein in 1942, and again on his own by the mathematician John Nash in 1948.",
  "Raymond Smullyan's puzzle books are full of knights, who always tell the truth, and knaves, who always lie.",
  // older puzzle makers
  "Sam Loyd, America's great 19th-century puzzle maker, often claimed puzzles he didn't invent, including the famous 15 puzzle.",
  "Half of all starting positions of the 15 puzzle can't be solved, so Sam Loyd's $1,000 prize for one of them was never paid.",
  "Henry Dudeney, England's great puzzle maker, published The Canterbury Puzzles in 1907.",
  "Lewis Carroll invented word ladders, which he called Doublets, and published them in Vanity Fair in 1879.",
  "Tangrams reached Europe and America from China in the early 1800s and set off a craze.",
  "Arthur Wynne published the first crossword in the New York World on December 21, 1913.",
  "The New York Times didn't print a crossword until 1942.",
  "Ernő Rubik made the first Rubik's Cube in 1974, as a way to explain 3D movement to his students.",
  "Alexey Pajitnov made Tetris in 1984, while working at a computer center in Moscow.",
  // the Japanese pen-and-paper world
  "Nikoli, Japan's famous puzzle publisher, was founded in 1980 and named after a racehorse.",
  "Maki Kaji, Nikoli's founder, named sudoku in 1984. It's short for a phrase meaning the digits must be single.",
  "Sudoku began as Number Place, made by Howard Garns for Dell Magazines in America in 1979.",
  "Maki Kaji was known as the godfather of sudoku.",
  "Sudoku took off in Britain in 2004, when The Times began printing puzzles from Wayne Gould, who had written a program to make them.",
  "Many Nikoli puzzle types were invented by readers, who send new ideas to the magazine.",
  "Nikoli prefers puzzles made by hand: a person can build in the moment where it clicks.",
  "Nonograms were invented in 1987 by two puzzle makers on their own: Non Ishida, who made pictures with lit windows of a skyscraper, and Tetsuya Nishio.",
  "Nonograms got their name in Britain, from Non Ishida plus diagram, when the Sunday Telegraph began printing them.",
  "Nurikabe is named after a creature of Japanese folklore: an invisible wall that blocks travelers' way.",
  "Hitori comes from a Japanese phrase meaning leave me alone.",
  "Akari means light, which is why the puzzle is also called Light Up.",
  "Heyawake means divided rooms.",
  "Kakuro comes from the Japanese words for addition and cross; the puzzle began in America as Cross Sums.",
  "The first World Puzzle Championship was held in New York in 1992.",
  "The first World Sudoku Championship was held in Lucca, Italy, in 2006.",
  // the thinky games world
  "Sokoban, the box-pushing puzzle, was made by Hiroyuki Imabayashi and published in 1982. Its name means warehouse keeper.",
  "Baba Is You, where you change the rules by pushing words around, began as Arvi Teikari's entry to the Nordic Game Jam in 2017.",
  "Stephen Lavelle, also known as increpare, made PuzzleScript, a free tool that thousands of people have used to make puzzle games.",
  "Stephen Lavelle also made Stephen's Sausage Roll (2016), a famously tough puzzle game about grilling sausages.",
  "Portal grew out of Narbacular Drop, a game made by students at DigiPen.",
  "In Patrick's Parabox (2022), by Patrick Traynor, boxes can contain other boxes, and even themselves.",
  "Jonathan Blow's The Witness (2016) teaches its line-drawing puzzles without a single word of instructions.",
  "Minesweeper came with Windows 3.1 in 1992, which is how millions of people learned it.",
  "Josh Wardle made Wordle in 2021 for his partner, who loves word games.",
  "MIT's Mystery Hunt, one of the oldest puzzle hunts, began in 1981.",
];
