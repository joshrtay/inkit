# Human-made puzzle sources: licences, terms and crawl rules

Checked 13–14 October 2026. Only public pages were read: terms, licence pages, about pages and robots.txt. No puzzle data was downloaded. This is a reading of what the sources and statutes say. It is not legal advice.

**Scope.** inkit is non-commercial. The use here is downloading puzzles for non-commercial research and model training (difficulty and next-move prediction). The data stays private, and derived models run on a non-commercial site. Republishing puzzles is out of scope; each source gets one line on it at most.

**Verdicts**
- **go**: allowed by the source's own licence.
- **go with care**: no licence, but a statutory exception or fair use plausibly covers it, and nothing on the site objects in machine-readable form. Respect the listed crawl rules.
- **ask first**: the terms or signals object, the status is unclear enough that a short email is cheaper than the risk, or a login would be needed.
- **avoid**: the source explicitly forbids it.

## 1. Verdict table

"Law" says which statutory exception would let us download for (A) without permission, if the copying happened in that jurisdiction. Abbreviations: JP 30-4 (Japan), EU Art. 4 (anyone, unless opted out), EU Art. 3 / DE §60d / AT §42h(1) (research; in DE and AT this also covers individual non-commercial researchers), SG s.244, UK s.29A, US fair use (unsettled). Section 3 has the details. Our servers and the developer are in the US, so US law is the most plausible fit, but that is uncertain (section 3.7).

| Source | Download for non-commercial research and training | Licence or terms (short quote, link) | Law: allowed without permission? | Crawl rules (robots.txt, rate, login, TDM opt-out) | Publishing (B) | Contact |
|---|---|---|---|---|---|---|
| **Janko, puzzles marked CC** (mostly by Otto Janko) | **go** | "Creative Commons 3.0 BY-NC-SA" ([licence page](https://www.janko.at/Raetsel/Creative-Commons.htm)); each puzzle page shows `Lizenz:` | Not needed: the licence allows non-commercial use. Licence governed by Austrian law | robots.txt: `Disallow` /Forum/, /Blog/, /Shariff/; blocks HTTrack, SiteSucker, MJ12bot, AhrefsBot, PetalBot, Lightpanda entirely. No crawl-delay. No login. No TDM reservation (no tdmrep.json, no headers) | Non-commercial only, with attribution and share-alike | homepage@janko.at |
| **Janko, puzzles marked "Freundliche Genehmigung des Autors", "Freeware" or "?"** | **go with care** | "andere Rätsel veröffentlichen wir mit Zustimmung des jeweiligen Autors" ([index](https://www.janko.at/Raetsel/index.htm)). The CC licence doesn't cover them | AT §42h(6) / EU Art. 4 yes (no machine-readable opt-out found); AT §42h(1) for non-commercial individual researchers; JP 30-4; US fair use | Same as above | No; ask each author | Author named per puzzle; Janko |
| **Puzzle Square JP** ([puzsq.logicpuzzle.app](https://puzsq.logicpuzzle.app/)) | **go with care** for publicly visible puzzles; **go** for its CC0 example puzzles | [Guideline](https://puzsq.logicpuzzle.app/guideline): "投稿情報の権利は、投稿者または正当な権利者に留保いたします" (rights stay with posters); bans reposting content outside the site; bans load on the system and "不正に情報を取得する行為" | JP 30-4 (site and authors mostly in Japan); US fair use | No robots.txt (404); homepage has `<meta name="robots" content="noindex">`. Client-side app on Firebase. **Unverified:** whether puzzle data is readable without login. If it needs login: ask first. No TDM reservation | No (rights with each poster); CC0 examples yes | Contact form linked from the site (Google Form); admins わんど and fff ([wiki](https://scrapbox.io/puzzle-pedia/%E3%83%91%E3%82%BA%E3%83%AB%E3%82%B9%E3%82%AF%E3%82%A8%E3%82%A2)) |
| **puzz.link** (player and /db) | **go with care** | "the copyright lies with their authors"; puzz.link "merely serve[s] an interface" ([puzz.link](https://puzz.link/)) | EU Art. 4 / DE §44b yes (no signals set); JP 30-4; US fair use | robots.txt is Cloudflare's content-signals preamble with **no user-agent, disallow or signal lines**: "neither grants nor restricts". No login for the player | No; the authors hold the rights | contact at puzz.link; GitHub issues |
| **pzv.jp** (PUZ-PRE v3) | **go with care** | No terms. The script is "licensed under the MIT license" (code only) | JP 30-4; US fair use | No robots.txt (404); `<meta name="robots" content="nofollow">`. No login | No | None stated |
| **Logic Masters Deutschland Rätselportal** | **go with care** | [Terms (2009)](https://logic-masters.de/nutzungsbedingungen.php): copyright "bleibt allein beim Autor"; reuse in other publications not allowed without consent of the association and users | DE §44b / EU Art. 4 yes (no machine-readable reservation; the terms' natural-language clause doesn't name TDM, and OLG Hamburg held natural-language reservations ineffective, now before the BGH); DE §60d for non-commercial individual researchers; US fair use | robots.txt: `Disallow` /Raetselportal/Benutzer/, /Raetselportal/Statistik/, /Raetselportal/Suche/erweitert.php. No crawl-delay. Puzzle pages appear to open without login. No TDM reservation | No without consent of each author | [Impressum](https://logic-masters.de/impressum.php) |
| **GM Puzzles** | **go with care** (free blog puzzles); **ask first** for paid books | "© 2012-2026 Grandmaster Puzzles. All rights reserved." [Terms](https://www.gmpuzzles.com/privacy): don't do anything "hurtful, harmful, or illegal" | US fair use (unsettled) | robots.txt: only /blog/ admin paths disallowed. No login for blog puzzles. No TDM reservation | No; ask | motris@gmpuzzles.com |
| **Nikoli, `nikoli_100` on Hugging Face** | **go** | "released under the CC BY 4.0 license"; "Please credit Nikoli" ([dataset](https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli)) | Not needed | Public, not gated | Yes, with credit (CC BY) | n/a |
| **Nikoli, everything else** (site, apps, books) | **ask first**; copies you bought: **go with care**, internal only | [著作権](https://www.nikoli.co.jp/ja/copyright/): reprinting or reuse "営利、非営利にかかわらず禁止" (forbidden whether commercial or not) | JP 30-4 covers analysis even against such terms (contract override is unsettled in Japan); US fair use | nikoli.co.jp has no robots.txt (404). puzzle.nikoli.com (パズコミュ) was down for maintenance; its login and terms are unverified | No; Nikoli licenses commercially ([business](https://www.nikoli.co.jp/ja/business/)) | [Contact form](https://www.nikoli.co.jp/ja/contact/contact03/) |
| **World Puzzle Federation** (WPC, WSC, GP archives) | **go with care** | No terms on the [site](https://worldpuzzle.org/), [rules](https://worldpuzzle.org/rules-and-regulations) or [statutes](https://worldpuzzle.org/statutes). Members get the "Right to publish WPF puzzles... in the member's home country" | Depends where the authors and organisers are; EU Art. 4; US fair use | worldpuzzle.org: only /wp-admin/ disallowed. gp.worldpuzzle.org: **`Crawl-delay: 10`**, code paths disallowed. No login for archive PDFs | No; rights likely with authors or organisers (unverified) | [worldpuzzle.org/contact](https://worldpuzzle.org/contact) |
| **SudokuPad / Cracking the Cryptic** | **ask first** | No terms page found ([sudokupad.app](https://sudokupad.app/) treats `/terms` as a puzzle ID). Page metadata: copyright "Sven Neumann". Sakana's CtC dataset has been withdrawn (see datasets) | US fair use; UK s.29A (CtC is UK-based) | sudokupad.app: no robots.txt. crackingthecryptic.com/robots.txt returns HTML. No TDM file | No; setters own their puzzles | sven@svencodes.com; setters individually |
| **Conceptis** | **ask first** | "Copyright © 1997-2025 Conceptis Ltd. All rights reserved." The terms page returned 404 (**unverified**) | US fair use; EU Art. 4 | robots.txt: admin and code paths only. Commercial publisher | No | Via the site |
| **Krazydad** | **ask first** | "Free to reproduce for personal, church, school, hospital or institutional use"; commercial: dad@krazydad.com ([home](https://krazydad.com/)) | Robots.txt blocks AI crawlers. That plausibly counts as an EU Art. 4 opt-out, so the EU route is closed outside research. US fair use | robots.txt: **`Disallow: /` for ClaudeBot, anthropic-ai, GPTBot, Google-Extended, CCBot, Google-CloudVertexBot**; others blocked from /ipuzzles/, /*sv=DL*, /search/ etc. | Ask | dad@krazydad.com |
| **Puzzle Baron** | **ask first** (low value: likely generated, unverified) | "© 2026 Puzzle Baron. All rights reserved."; no terms page linked | US fair use | No robots.txt | No | /contact/ |
| **BrainBashers** | **avoid** | [Terms](https://www.brainbashers.com/copyright.asp) forbid scraping "for training or developing machine learning or artificial intelligence systems" | The clause is contractual and natural-language. SG s.187 and UK s.29A(5) would void it; elsewhere unclear | robots.txt empty | No | Contact page |
| **Erich Friedman's Puzzle Palace** | **ask first** (courtesy; small) | No copyright or reuse statement on the [page](https://erich-friedman.github.io/puzzle/) | US fair use | No robots rules found (GitHub Pages) | Ask | Erich Friedman |
| **Menneske.no** | **avoid** | [Copyright](https://www.menneske.no/copyright.html): "Elektronisk lagring av materialet er ulovlig" (electronic storage is illegal); personal non-commercial use only | EU/EEA Art. 4 (Norway) has no machine-readable opt-out, but the policy is explicit | robots.txt: disallows `/*?`, /bilder/, /gallery/ and more; `Crawl-delay: 60` for Slurp | No | Vegard@menneske.no |
| **Simon Tatham's Portable Puzzle Collection** | **go** (generated, not human-made) | MIT: "Permission is hereby granted, free of charge" ([licence](https://www.chiark.greenend.org.uk/~sgtatham/puzzles/doc/licence.html)) | Not needed | Run the generators locally; no crawl | Yes (MIT) | n/a |
| **Beast Academy (AoPS)** | **avoid** | robots.txt: `Content-Signal: search=yes,ai-train=no`; [ToS](https://artofproblemsolving.com/company/tos) §20 bars commercial exploitation; online content needs login | AI-training opt-out stated in machine-readable form | Login required for online lessons | No | AoPS |

## 2. Datasets

| Dataset | What | Licence | Verdict |
|---|---|---|---|
| [SakanaAI/sudoku-bench-nikoli](https://huggingface.co/datasets/SakanaAI/sudoku-bench-nikoli) | 100 handmade Nikoli Sudoku | CC BY 4.0, "Please credit Nikoli" | **go** |
| SakanaAI/Sudoku-Bench and Sudoku-CTC-Reasoning (CtC puzzles and human solving transcripts) | Puzzles plus reasoning traces | Withdrawn. The [GitHub README](https://github.com/SakanaAI/Sudoku-Bench) says "This project has been discontinued" and that materials "are no longer available". The Hugging Face pages return 401. No reason given | **avoid** (don't use mirrors) |
| [puzzlekit-dataset](https://github.com/SmilingWayne/puzzlekit-dataset) | 52k+ instances, "mostly from" Janko and puzz.link ([puzzlekit](https://github.com/SmilingWayne/puzzlekit)) | No licence on the dataset repo; code is MIT | **go with care**: rights follow each source (filter Janko by its `Lizenz` field). Useful as an index |
| Radcliffe "3 million Sudoku puzzles with ratings" (Kaggle; [OpenML mirror](https://api.openml.org/d/43476)) | Generated Sudoku with solver ratings | CC0 per the OpenML mirror (Kaggle page unverified) | **go**, but generated, not human-made |
| Pelánek, Sudoku solving times ([2014 paper](https://arxiv.org/abs/1403.7373), [2011 report](https://www.fi.muni.cz/~xpelanek/publications/sudoku-tr.pdf)) | Human solve times from three Sudoku portals | Not published as a dataset (unverified) | **ask first**: Radek Pelánek, Masaryk University |
| [PuzzleWorld](https://huggingface.co/datasets/hzli1202/PuzzleWorld) | 667 puzzle-hunt puzzles (Puzzled Pint) | CC BY-SA | go, but off-genre |
| bay-puz/psjp ([GitHub](https://github.com/bay-puz/psjp)) | PSJP metadata: likes, solver counts | MIT for the repo; the README says nothing about the puzzles' rights | **go** for metadata; puzzles follow the PSJP row |

No openly licensed dataset of human-made pencil puzzles (Slitherlink, Masyu, Star Battle and so on) with human solving data turned up. The withdrawn Sakana CtC set was the closest.

## 3. The law

### 3.1 Is a puzzle grid protected?
- **Japan.** A creator's note ([nyoroppyi](https://note.com/nyoroppyi/n/nb2c22247be7f)) argues most puzzles are works but that rules and ideas aren't. It summarises a Tokyo court case on math puzzles that found infringement in 3 of 12. The test is whether individuality is creatively expressed, as opposed to being expressed in "ありふれた一般的な形" (an ordinary, generic form). Nikoli claims copyright in its puzzle rules ([著作権](https://www.nikoli.co.jp/ja/copyright/)). That goes beyond the general rule that ideas aren't protected.
- **US.** Originality is required (*Feist v. Rural*, 499 U.S. 340 (1991)), and game rules and methods aren't protected. The Copyright Office has said a crossword needs "human authorship" to register ([Copyright Lore, April 2015](https://www.copyright.gov/history/lore/pdfs/201504%20CLore_April2015.pdf)). No US case on a Sudoku or Slitherlink grid was found (unverified). Hand-set puzzles with deliberate clue placement are the strongest case for protection; computer-generated ones are the weakest.
- **Germany/EU.** No case on pencil-puzzle grids was found (unverified). Assume hand-made puzzles may be protected and treat them that way.

### 3.2 EU database right
The [Database Directive 96/9/EC](https://eur-lex.europa.eu/eli/dir/1996/9/oj) Art. 7 protects substantial investment in *obtaining, verifying or presenting* contents. In *British Horseracing Board v William Hill* (C-203/02) the CJEU held that investment in *creating* the data doesn't count. Collections of puzzles their authors created, such as Janko's own, therefore have a weaker database-right claim than curated third-party collections. The right exists only in the EU/EEA; there is no equivalent in the US or Japan. The TDM exceptions below also cover the database right.

### 3.3 Text-and-data-mining exceptions
| Jurisdiction | Provision | Who and what | Opt-out? | Contract override? |
|---|---|---|---|---|
| Japan | [Copyright Act Art. 30-4](https://www.japaneselawtranslation.go.jp/en/laws/view/4207) | Anyone, commercial or not, "for use in data analysis" | No opt-out. Proviso: not if it "would unreasonably prejudice the interests of the copyright owner" | No explicit rule; unsettled |
| Singapore | Copyright Act 2021 ss. 243–244 | Anyone, "computational data analysis", including training; needs lawful access | No | s.187 voids contract terms that exclude it ([Bird & Bird](https://www.twobirds.com/en/insights/2021/singapore/coming-up-in-singapore-new-copyright-exception-for-text-and-data-mining), [Reed Smith](https://www.reedsmith.com/articles/text-and-data-mining-in-singapore/)) |
| EU | [DSM Directive 2019/790](https://eur-lex.europa.eu/eli/dir/2019/790/oj) Art. 3 | Research organisations and cultural-heritage institutions, scientific research, lawful access | No | Art. 7(1): contrary contract terms unenforceable |
| EU | DSM Art. 4 | Anyone, any purpose, lawful access | Yes: reserved "in an appropriate manner, such as machine-readable means" for online content. Recital 18 lists "metadata and terms and conditions" | Opt-out is the mechanism |
| Germany | [UrhG §44b](https://www.gesetze-im-internet.de/urhg/__44b.html) (Art. 4) and [§60d](https://www.gesetze-im-internet.de/urhg/__60d.html) (Art. 3) | §44b anyone; §60d research organisations **and individual researchers "sofern sie nicht kommerzielle Zwecke verfolgen"** | §44b(3): an online reservation works only "in maschinenlesbarer Form"; §60d none | §60d not overridable |
| Austria | [UrhG §42h](https://www.ris.bka.gv.at/eli/bgbl/1936/111/P42h/NOR40241407) | Abs. 1 research, including non-commercial individual researchers; Abs. 6 anyone | Abs. 6: not if expressly reserved, e.g. by machine-readable means; Abs. 1 none | Abs. 5: research use can't be waived by contract |
| UK | [CDPA s.29A](https://www.legislation.gov.uk/ukpga/1988/48/section/29A) | "the sole purpose of research for a non-commercial purpose", lawful access | No | s.29A(5): restricting terms "unenforceable" |
| US | Fair use, 17 U.S.C. §107 | Case by case | No statutory opt-out | Terms enforced as contract (3.5) |

**Notes**
- **Japan.** Commentary on the Agency for Cultural Affairs' 2024 *General Understanding on AI and Copyright* says the proviso bites in two situations ([APAA summary](https://apaaonline.org/article/general-understanding-on-ai-and-copyright-in-japan/), [Ueno, WIPO](https://www.wipo.int/documents/d/office-japan/docs-en-tatsuhiro-ueno_general-understanding-on-ai-and-copyright-in-japan_set.pdf)). One is when an "enjoyment" purpose coexists with analysis, for example training meant to reproduce the works. The other is when someone circumvents technical measures, such as robots.txt, that protect a database sold, or expected to be sold, for analysis. Difficulty prediction is analysis, not enjoyment. Nikoli sells puzzles commercially but not, as far as found, as an analysis database. Secondary sources only; the primary text was not read.
- **EU, what counts as an opt-out.** robots.txt rules aimed at AI crawlers and the [TDMRep](https://www.w3.org/community/reports/tdmrep/CG-FINAL-tdmrep-20240202/) protocol (`/.well-known/tdmrep.json` or `tdm-reservation` headers) are machine-readable. Natural-language terms are contested. In *Kneschke v LAION* the Hamburg Regional Court (27 Sep 2024) leaned toward treating them as valid. On 10 Dec 2025 the Hamburg Higher Regional Court (5 U 104/24) held a natural-language clause wasn't machine-readable and upheld the §60d research exception for a non-profit. An appeal to the BGH is pending ([Bird & Bird](https://cm.twobirds.com/en/insights/2025/germany/higher-regional-court-hamburg-confirms-ai-training-was-permitted-(kneschke-v,-d-,-laion)), [Open Future](https://openfuture.eu/blog/laion-round-2-machine-readable-but-still-not-actionable/)).
- **Our checks.** No source had a `tdmrep.json`. Some returned 200 on that path, but the body was the site's HTML: puzzle.nikoli.com, sudokupad.app, crackingthecryptic.com and beastacademy.com. No source sent `tdm-reservation` headers. Only Krazydad (named AI bots) and AoPS (`ai-train=no`) have machine-readable AI reservations. puzz.link has the Cloudflare content-signal preamble but sets no signals.
- **Is inkit a "research organisation" under Art. 3?** Doubtful: the definition is aimed at universities and institutes whose primary goal is research. The German and Austrian individual-researcher clauses (§60d(3) no. 2, §42h(1)) fit a non-commercial researcher better. Since the whole use is non-commercial, the non-commercial conditions in UK s.29A, §60d and §42h(1) are met as long as that stays true.

### 3.4 US fair use for training (unsettled)
- *Bartz v. Anthropic* (N.D. Cal., June 2025, Alsup J.): training on lawfully acquired books was fair use; building a library from pirated copies was not. The case later settled.
- *Kadrey v. Meta* (N.D. Cal., June 2025, Chhabria J.): fair use on that record, with a warning that market dilution could weigh against it in other cases.
- *Thomson Reuters v. ROSS* (3d Cir., 29 Sep 2026): the first appellate ruling. Training a non-generative legal-search tool on Westlaw headnotes was **not** fair use. Factor 1 was "highly commercial", "minimally transformative"; factor 4 counted a "rapidly developing" market for licensing training data. Generative training was left open ([Ballard Spahr](https://www.ballardspahr.com/insights/alerts-and-articles/2026/10/third-circuit-addresses-fair-use-in-ai-training-but-leaves-generative-ai-questions-unresolved), [Patently-O](https://patentlyo.com/patent/2026/10/ease-is-not-necessity-third-circuit-affirms-no-fair-use-in-thomson-reuters-v-ross.html)).

**Applied to us, without over-claiming:** our use is non-commercial, the data is internal, and the models predict difficulty rather than output puzzles. Those point toward fair use. *ROSS* shows a court can count a licensing market for training data against it. Taking only lawfully accessible copies, never paywalled or pirated ones, matters under *Bartz*.

### 3.5 Scraping, access and terms (US)
- *Van Buren v. United States*, 593 U.S. 374 (2021): CFAA "exceeds authorized access" is a gates-up-or-down question. Misusing data you're entitled to see isn't a CFAA crime.
- *hiQ Labs v. LinkedIn*, 31 F.4th 1180 (9th Cir. 2022): scraping public, logged-out pages is likely not "without authorization" under the CFAA. On remand (N.D. Cal., Nov 2022), hiQ was nonetheless held to have breached LinkedIn's user agreement. Terms matter as contract.
- *Meta v. Bright Data* (N.D. Cal., Jan 2024): Meta's terms didn't bar logged-out scraping of public data by a non-user. Meta then dropped the case.
- **Takeaway:** logged-out scraping of public pages is low CFAA risk. Logging in means accepting terms and shifts the risk to contract. Hence the rule: we don't log in to scrape.

### 3.6 Licences
CC BY-NC-SA 3.0 (Janko) allows non-commercial copying and adaptation with attribution. Share-alike applies only when adaptations are shared. Whether trained model weights are an "adaptation" is unsettled, but we don't distribute them. Keep author and source per puzzle. CC BY 4.0 (`nikoli_100`) needs credit only.

### 3.7 Which law applies
Unresolved, and this report doesn't resolve it. Our servers and the developer are in the US, which makes US law the most plausible law for our copying. The Japanese, Singapore and EU exceptions apply to acts done there, so they don't straightforwardly cover copying on US servers. The EU and Japanese verdicts above therefore show that the source's home law doesn't object; they aren't a shield in themselves. Contract claims follow each site's terms and their governing-law clause; Janko's CC licence names Austrian law.

## 4. Recommendation

**Go now (licence):**
- Janko puzzles whose `Lizenz:` field reads "Creative Commons 3.0 BY-NC-SA".
- Nikoli's `nikoli_100` (CC BY 4.0).
- PSJP's CC0 example puzzles.
- Tatham's generators and the CC0 Radcliffe set, for generated baselines.

Store author and source with each puzzle.

**Go with care (no licence; exception or fair use; no machine-readable objection):**
- Janko's remaining puzzles: "Freundliche Genehmigung des Autors", "Freeware", "?".
- puzz.link-shared puzzles and pzv.jp URLs.
- Logic Masters Rätselportal.
- Puzzle Square JP public puzzles. Confirm first that no login is needed.
- WPF archive PDFs.
- GM Puzzles' free blog puzzles.

Rules for all of them:
1. Obey every robots.txt `Disallow` listed above and gp.worldpuzzle.org's `Crawl-delay: 10`.
2. Use no more than about one request every few seconds elsewhere (PSJP bans load on the system), and identify the crawler with a contact address.
3. Don't use the tools Janko blocks (HTTrack, SiteSucker).
4. Never log in to scrape. Don't touch paid or paywalled material.
5. Keep the data private and record provenance.
6. Re-check robots.txt and TDMRep before each crawl, since a new opt-out changes the EU verdict.

**Ask first, and who to ask:**
- GM Puzzles: motris@gmpuzzles.com. Cheap to ask, and it settles the fair-use question.
- Puzzle Square JP admins, via the site's contact form. A courtesy note, or if login turns out to be needed.
- Nikoli, via the [contact form](https://www.nikoli.co.jp/ja/contact/contact03/), for anything beyond `nikoli_100` or bought copies.
- Cracking the Cryptic and SudokuPad: sven@svencodes.com and the setters. Sakana's withdrawal is a signal.
- Krazydad: dad@krazydad.com.
- Conceptis and Puzzle Baron: via their sites.
- Erich Friedman.
- Radek Pelánek, for the solving-time data.
- WPF, if the archive is to be used in bulk: [contact](https://worldpuzzle.org/contact).

**Avoid:** BrainBashers (explicit ML ban), Menneske.no (forbids electronic storage), Beast Academy/AoPS (`ai-train=no`, login), and mirrors of the withdrawn Sakana CtC data.

## 5. Unverified
- Puzzle Square JP: whether puzzle data needs login; the current admin names (from a community wiki).
- Conceptis terms (the page returned 404) and Kaggle's own licence field for the Radcliffe set.
- Whether Puzzle Baron, Krazydad and Menneske puzzles are computer-generated.
- Who holds rights in WPF competition puzzles. Nothing on the WPF site says.
- puzzle.nikoli.com terms and login (the site was down for maintenance).
- The Japanese Agency for Cultural Affairs' primary text on robots.txt and databases. Summarised from commentary.
- Any case law on copyright in pencil-puzzle grids specifically.
