import { getSummaSections } from './data-loader';
import { cleanLatinString, splitIntoSentences } from './normalizer';
import { analyzeWord } from './dictionaries';

export interface InterlinearToken {
  word: string;
  lemma: string;
  gloss: string;
  morphShort: string;
}

export interface SentenceTranslationResult {
  interlinearGloss: InterlinearToken[];
  literalTranslation: string;
  contextualTranslation: string;
  referenceTranslation?: string;
}

const SCHOLASTIC_TOKEN_GLOSSES: Record<string, { lemma: string; gloss: string; morph: string }> = {
  et: { lemma: 'et', gloss: 'and', morph: 'conj.' },
  in: { lemma: 'in', gloss: 'in / into', morph: 'prep.' },
  ad: { lemma: 'ad', gloss: 'to / toward / for', morph: 'prep. + acc.' },
  de: { lemma: 'de', gloss: 'concerning / of / from', morph: 'prep. + abl.' },
  ex: { lemma: 'ex', gloss: 'from / out of', morph: 'prep. + abl.' },
  ab: { lemma: 'ab', gloss: 'by / from', morph: 'prep. + abl.' },
  a: { lemma: 'a', gloss: 'by / from', morph: 'prep. + abl.' },
  per: { lemma: 'per', gloss: 'through / by', morph: 'prep. + acc.' },
  cum: { lemma: 'cum', gloss: 'with / since / when', morph: 'prep./conj.' },
  sub: { lemma: 'sub', gloss: 'under', morph: 'prep.' },
  super: { lemma: 'super', gloss: 'above / upon', morph: 'prep.' },
  supra: { lemma: 'supra', gloss: 'above / beyond', morph: 'prep. + acc.' },
  praeter: { lemma: 'praeter', gloss: 'besides / beyond', morph: 'prep. + acc.' },
  propter: { lemma: 'propter', gloss: 'on account of / for', morph: 'prep. + acc.' },
  secundum: { lemma: 'secundum', gloss: 'according to', morph: 'prep. + acc.' },
  contra: { lemma: 'contra', gloss: 'against / on the contrary', morph: 'prep./adv.' },
  circa: { lemma: 'circa', gloss: 'concerning / around', morph: 'prep. + acc.' },
  absque: { lemma: 'absque', gloss: 'without / apart from', morph: 'prep. + abl.' },
  sine: { lemma: 'sine', gloss: 'without', morph: 'prep. + abl.' },
  coram: { lemma: 'coram', gloss: 'before / in the presence of', morph: 'prep. + abl.' },
  apud: { lemma: 'apud', gloss: 'among / with / in', morph: 'prep. + acc.' },
  inter: { lemma: 'inter', gloss: 'between / among', morph: 'prep. + acc.' },
  non: { lemma: 'non', gloss: 'not', morph: 'adv.' },
  nec: { lemma: 'nec', gloss: 'nor / and not', morph: 'conj.' },
  neque: { lemma: 'neque', gloss: 'neither / nor', morph: 'conj.' },
  sed: { lemma: 'sed', gloss: 'but', morph: 'conj.' },
  autem: { lemma: 'autem', gloss: 'however / now', morph: 'conj.' },
  vero: { lemma: 'vero', gloss: 'truly / but / whereas', morph: 'adv./conj.' },
  enim: { lemma: 'enim', gloss: 'for / indeed', morph: 'conj.' },
  nam: { lemma: 'nam', gloss: 'for', morph: 'conj.' },
  igitur: { lemma: 'igitur', gloss: 'therefore', morph: 'conj.' },
  ergo: { lemma: 'ergo', gloss: 'therefore', morph: 'conj.' },
  unde: { lemma: 'unde', gloss: 'whence / hence', morph: 'adv.' },
  ideo: { lemma: 'ideo', gloss: 'therefore / for this reason', morph: 'adv.' },
  ita: { lemma: 'ita', gloss: 'thus / so', morph: 'adv.' },
  sic: { lemma: 'sic', gloss: 'thus / in this way', morph: 'adv.' },
  sicut: { lemma: 'sicut', gloss: 'just as / as', morph: 'conj.' },
  vel: { lemma: 'vel', gloss: 'or', morph: 'conj.' },
  aut: { lemma: 'aut', gloss: 'or / either', morph: 'conj.' },
  sive: { lemma: 'sive', gloss: 'or / whether', morph: 'conj.' },
  ut: { lemma: 'ut', gloss: 'that / in order that / as', morph: 'conj.' },
  ne: { lemma: 'ne', gloss: 'lest / do not', morph: 'conj.' },
  quod: { lemma: 'quod', gloss: 'that / which / because', morph: 'conj./pron.' },
  quia: { lemma: 'quia', gloss: 'because / that', morph: 'conj.' },
  quoniam: { lemma: 'quoniam', gloss: 'since / because', morph: 'conj.' },
  quamvis: { lemma: 'quamvis', gloss: 'although', morph: 'conj.' },
  licet: { lemma: 'licet', gloss: 'although / even though', morph: 'conj.' },
  tamen: { lemma: 'tamen', gloss: 'nevertheless / yet', morph: 'adv.' },
  si: { lemma: 'si', gloss: 'if', morph: 'conj.' },
  nisi: { lemma: 'nisi', gloss: 'unless / except', morph: 'conj.' },
  utrum: { lemma: 'utrum', gloss: 'whether', morph: 'conj.' },
  an: { lemma: 'an', gloss: 'or whether', morph: 'conj.' },
  etiam: { lemma: 'etiam', gloss: 'also / even', morph: 'adv.' },
  quoque: { lemma: 'quoque', gloss: 'also', morph: 'adv.' },
  tantum: { lemma: 'tantum', gloss: 'only / so much', morph: 'adv.' },
  solum: { lemma: 'solum', gloss: 'only / alone', morph: 'adv.' },
  quidem: { lemma: 'quidem', gloss: 'indeed', morph: 'adv.' },
  scilicet: { lemma: 'scilicet', gloss: 'namely', morph: 'adv.' },
  idest: { lemma: 'id est', gloss: 'that is (i.e.)', morph: 'adv.' },
  puta: { lemma: 'puta', gloss: 'for instance', morph: 'adv.' },
  quasi: { lemma: 'quasi', gloss: 'as it were / as if', morph: 'adv.' },
  velut: { lemma: 'velut', gloss: 'just like / as', morph: 'adv.' },
  inquantum: { lemma: 'inquantum', gloss: 'insofar as', morph: 'conj.' },
  intantum: { lemma: 'intantum', gloss: 'to such an extent', morph: 'adv.' },
  praeterea: { lemma: 'praeterea', gloss: 'furthermore / moreover', morph: 'adv.' },
  videtur: { lemma: 'video', gloss: 'it seems', morph: '3sg pres. pass.' },
  respondeo: { lemma: 'respondeo', gloss: 'I answer', morph: '1sg pres. act.' },
  dicendum: { lemma: 'dico', gloss: 'it must be said', morph: 'gerundive' },
  proceditur: { lemma: 'procedo', gloss: 'one proceeds', morph: '3sg pres. pass.' },
  dicitur: { lemma: 'dico', gloss: 'it is said', morph: '3sg pres. pass.' },
  patet: { lemma: 'pateo', gloss: 'is evident / clear', morph: '3sg pres. act.' },
  oportet: { lemma: 'oportet', gloss: 'it is necessary / must', morph: '3sg impers.' },
  potest: { lemma: 'possum', gloss: 'can / is able', morph: '3sg pres. act.' },
  possunt: { lemma: 'possum', gloss: 'can / are able', morph: '3pl pres. act.' },
  debet: { lemma: 'debeo', gloss: 'ought / must', morph: '3sg pres. act.' },
  debent: { lemma: 'debeo', gloss: 'ought / must', morph: '3pl pres. act.' },
  habet: { lemma: 'habeo', gloss: 'has', morph: '3sg pres. act.' },
  habent: { lemma: 'habeo', gloss: 'have', morph: '3pl pres. act.' },
  haberi: { lemma: 'habeo', gloss: 'to be had / possessed', morph: 'pres. pass. inf.' },
  est: { lemma: 'sum', gloss: 'is', morph: '3sg pres. act.' },
  sunt: { lemma: 'sum', gloss: 'are', morph: '3pl pres. act.' },
  sit: { lemma: 'sum', gloss: 'is / may be', morph: '3sg pres. subj.' },
  sint: { lemma: 'sum', gloss: 'are / may be', morph: '3pl pres. subj.' },
  fuit: { lemma: 'sum', gloss: 'was', morph: '3sg perf. act.' },
  erat: { lemma: 'sum', gloss: 'was', morph: '3sg impf. act.' },
  esse: { lemma: 'sum', gloss: 'to be / being', morph: 'pres. inf.' },
  esset: { lemma: 'sum', gloss: 'would be / were', morph: '3sg impf. subj.' },
  qui: { lemma: 'qui', gloss: 'who / which', morph: 'nom. rel. pron.' },
  quae: { lemma: 'qui', gloss: 'which / who / what', morph: 'rel. pron.' },
  cuius: { lemma: 'qui', gloss: 'whose / of which', morph: 'gen. sg. rel.' },
  cui: { lemma: 'qui', gloss: 'to whom / to which', morph: 'dat. sg. rel.' },
  quibus: { lemma: 'qui', gloss: 'by/to which / whom', morph: 'dat./abl. pl. rel.' },
  huius: { lemma: 'hic', gloss: 'of this', morph: 'gen. sg. dem.' },
  hoc: { lemma: 'hic', gloss: 'this', morph: 'nom./acc./abl. sg.' },
  haec: { lemma: 'hic', gloss: 'this / these', morph: 'dem. pron.' },
  his: { lemma: 'hic', gloss: 'these / those things', morph: 'dat./abl. pl.' },
  huiusmodi: { lemma: 'huiusmodi', gloss: 'of this kind / such', morph: 'indecl. gen.' },
  illud: { lemma: 'ille', gloss: 'that [saying]', morph: 'nom./acc. sg. n.' },
  ille: { lemma: 'ille', gloss: 'he / that one', morph: 'nom. sg. m.' },
  illa: { lemma: 'ille', gloss: 'that / those', morph: 'dem. pron.' },
  ipse: { lemma: 'ipse', gloss: 'himself / itself', morph: 'intens. pron.' },
  ipsa: { lemma: 'ipse', gloss: 'itself / very', morph: 'intens. pron.' },
  ipsum: { lemma: 'ipse', gloss: 'itself / him', morph: 'intens. pron.' },
  eius: { lemma: 'is', gloss: 'of it / his / its', morph: 'gen. sg.' },
  ei: { lemma: 'is', gloss: 'to him / to it', morph: 'dat. sg.' },
  ea: { lemma: 'is', gloss: 'those things / she', morph: 'pron.' },
  eis: { lemma: 'is', gloss: 'to/by them', morph: 'dat./abl. pl.' },
  eorum: { lemma: 'is', gloss: 'of them / their', morph: 'gen. pl.' },
  se: { lemma: 'sui', gloss: 'itself / himself / themselves', morph: 'refl. pron.' },
  sibi: { lemma: 'sui', gloss: 'to itself / himself', morph: 'dat. refl.' },
  suas: { lemma: 'suus', gloss: 'their own / his own', morph: 'acc. pl. f.' },
  sua: { lemma: 'suus', gloss: 'its own / his own', morph: 'nom./abl. sg. f.' },
  nihil: { lemma: 'nihil', gloss: 'nothing', morph: 'indecl. n.' },
  aliquid: { lemma: 'aliquis', gloss: 'something', morph: 'nom./acc. sg. n.' },
  aliqua: { lemma: 'aliqui', gloss: 'some / certain', morph: 'adj./pron.' },
  quaedam: { lemma: 'quidam', gloss: 'certain / a certain', morph: 'pron./adj.' },
  quandam: { lemma: 'quidam', gloss: 'a certain', morph: 'acc. sg. f.' },
  quendam: { lemma: 'quidam', gloss: 'a certain', morph: 'acc. sg. m.' },
  omnis: { lemma: 'omnis', gloss: 'every / all', morph: 'nom./gen. sg.' },
  omnia: { lemma: 'omnis', gloss: 'all things', morph: 'nom./acc. pl. n.' },
  omnibus: { lemma: 'omnis', gloss: 'all / everyone', morph: 'dat./abl. pl.' },
  omnium: { lemma: 'omnis', gloss: 'of all', morph: 'gen. pl.' },
  homo: { lemma: 'homo', gloss: 'man / human being', morph: 'nom. sg. m.' },
  hominis: { lemma: 'homo', gloss: "of man / man's", morph: 'gen. sg. m.' },
  homini: { lemma: 'homo', gloss: 'to/for man', morph: 'dat. sg. m.' },
  hominem: { lemma: 'homo', gloss: 'man', morph: 'acc. sg. m.' },
  homine: { lemma: 'homo', gloss: 'by/from man', morph: 'abl. sg. m.' },
  hominibus: { lemma: 'homo', gloss: 'to/for men', morph: 'dat./abl. pl. m.' },
  hominum: { lemma: 'homo', gloss: 'of men', morph: 'gen. pl. m.' },
  deus: { lemma: 'Deus', gloss: 'God', morph: 'nom. sg. m.' },
  dei: { lemma: 'Deus', gloss: 'of God', morph: 'gen. sg. m.' },
  deo: { lemma: 'Deus', gloss: 'to/by/in God', morph: 'dat./abl. sg. m.' },
  deum: { lemma: 'Deus', gloss: 'God', morph: 'acc. sg. m.' },
  doctrina: { lemma: 'doctrina', gloss: 'doctrine / teaching', morph: 'nom./abl. sg. f.' },
  doctrinae: { lemma: 'doctrina', gloss: 'of doctrine', morph: 'gen./dat. sg. f.' },
  doctrinam: { lemma: 'doctrina', gloss: 'doctrine / teaching', morph: 'acc. sg. f.' },
  sacra: { lemma: 'sacer', gloss: 'sacred', morph: 'nom./abl. sg. f.' },
  sacrae: { lemma: 'sacer', gloss: 'of sacred', morph: 'gen./dat. sg. f.' },
  sacram: { lemma: 'sacer', gloss: 'sacred', morph: 'acc. sg. f.' },
  scientia: { lemma: 'scientia', gloss: 'science / knowledge', morph: 'nom./abl. sg. f.' },
  scientiae: { lemma: 'scientia', gloss: 'of science / sciences', morph: 'gen. sg. / nom. pl.' },
  scientiam: { lemma: 'scientia', gloss: 'science / knowledge', morph: 'acc. sg. f.' },
  scientias: { lemma: 'scientia', gloss: 'sciences', morph: 'acc. pl. f.' },
  scientiis: { lemma: 'scientia', gloss: 'sciences', morph: 'dat./abl. pl. f.' },
  scientiarum: { lemma: 'scientia', gloss: 'of sciences', morph: 'gen. pl. f.' },
  ratio: { lemma: 'ratio', gloss: 'reason / formal aspect', morph: 'nom. sg. f.' },
  rationis: { lemma: 'ratio', gloss: 'of reason', morph: 'gen. sg. f.' },
  rationi: { lemma: 'ratio', gloss: 'to reason', morph: 'dat. sg. f.' },
  rationem: { lemma: 'ratio', gloss: 'reason / aspect', morph: 'acc. sg. f.' },
  ratione: { lemma: 'ratio', gloss: 'by/in reason or aspect', morph: 'abl. sg. f.' },
  salus: { lemma: 'salus', gloss: 'salvation', morph: 'nom. sg. f.' },
  salutis: { lemma: 'salus', gloss: 'of salvation', morph: 'gen. sg. f.' },
  salutem: { lemma: 'salus', gloss: 'salvation', morph: 'acc. sg. f.' },
  revelatio: { lemma: 'revelatio', gloss: 'revelation', morph: 'nom. sg. f.' },
  revelationis: { lemma: 'revelatio', gloss: 'of revelation', morph: 'gen. sg. f.' },
  revelationem: { lemma: 'revelatio', gloss: 'revelation', morph: 'acc. sg. f.' },
  revelatione: { lemma: 'revelatio', gloss: 'by revelation', morph: 'abl. sg. f.' },
  necessarium: { lemma: 'necessarius', gloss: 'necessary', morph: 'nom./acc. sg. n.' },
  philosophicas: { lemma: 'philosophicus', gloss: 'philosophical', morph: 'acc. pl. f.' },
  philosophicis: { lemma: 'philosophicus', gloss: 'philosophical', morph: 'dat./abl. pl. f.' },
  disciplinas: { lemma: 'disciplina', gloss: 'disciplines', morph: 'acc. pl. f.' },
  disciplinis: { lemma: 'disciplina', gloss: 'disciplines', morph: 'dat./abl. pl. f.' },
  ente: { lemma: 'ens', gloss: 'being', morph: 'abl. sg. n.' },
  entibus: { lemma: 'ens', gloss: 'beings', morph: 'dat./abl. pl. n.' },
  verum: { lemma: 'verus', gloss: 'the true / truth', morph: 'nom./acc. sg. n.' },
  veritas: { lemma: 'veritas', gloss: 'truth', morph: 'nom. sg. f.' },
  veritatis: { lemma: 'veritas', gloss: 'of truth', morph: 'gen. sg. f.' },
  finem: { lemma: 'finis', gloss: 'end / goal', morph: 'acc. sg. m.' },
  finis: { lemma: 'finis', gloss: 'end / goal', morph: 'nom./gen. sg. m.' },
  primo: { lemma: 'primus', gloss: 'firstly', morph: 'adv./abl.' },
  secundo: { lemma: 'secundus', gloss: 'secondly', morph: 'adv./abl.' },
  tertio: { lemma: 'tertius', gloss: 'thirdly', morph: 'adv./abl.' },
  quarto: { lemma: 'quartus', gloss: 'fourthly', morph: 'adv./abl.' },
  quinto: { lemma: 'quintus', gloss: 'fifthly', morph: 'adv./abl.' },
  sexto: { lemma: 'sextus', gloss: 'sixthly', morph: 'adv./abl.' },
  septimo: { lemma: 'septimus', gloss: 'seventhly', morph: 'adv./abl.' },
  octavo: { lemma: 'octavus', gloss: 'eighthly', morph: 'adv./abl.' },
  nono: { lemma: 'nonus', gloss: 'ninthly', morph: 'adv./abl.' },
  decimo: { lemma: 'decimus', gloss: 'tenthly', morph: 'adv./abl.' },
  secunda: { lemma: 'secundus', gloss: 'second', morph: 'nom./abl. sg. f.' },
  secundam: { lemma: 'secundus', gloss: 'second', morph: 'acc. sg. f.' },
  ibi: { lemma: 'ibi', gloss: 'there / at that point', morph: 'adv.' },
  hic: { lemma: 'hic', gloss: 'here / this', morph: 'adv./pron.' },
  hac: { lemma: 'hic', gloss: 'this', morph: 'abl. sg. f.' },
  quo: { lemma: 'qui', gloss: 'which / whom', morph: 'abl. sg.' },
  nobis: { lemma: 'nos', gloss: 'to/for us', morph: 'dat./abl. pl.' },
  quantum: { lemma: 'quantus', gloss: 'as much as / with respect (quantum ad)', morph: 'adv./acc.' },
  utendum: { lemma: 'utor', gloss: 'to be used (whether one should use)', morph: 'gerundive' },
  fruendum: { lemma: 'fruor', gloss: 'to be enjoyed (whether one should enjoy)', morph: 'gerundive' },
  considerandum: { lemma: 'considero', gloss: 'must be considered', morph: 'gerundive' },
  considerationem: { lemma: 'consideratio', gloss: 'consideration / inquiry', morph: 'acc. sg. f.' },
  operis: { lemma: 'opus', gloss: 'of the work', morph: 'gen. sg. n.' },
  magister: { lemma: 'magister', gloss: 'the Master [Peter Lombard]', morph: 'nom. sg. m.' },
  divinorum: { lemma: 'divinus', gloss: 'of divine things', morph: 'gen. pl. n.' },
  tradere: { lemma: 'trado', gloss: 'to hand on / teach', morph: 'pres. act. inf.' },
  intendit: { lemma: 'intendo', gloss: 'intends / aims', morph: '3sg pres. act.' },
  inquisitionem: { lemma: 'inquisitio', gloss: 'investigation / search', morph: 'acc. sg. f.' },
  destructionem: { lemma: 'destructio', gloss: 'overthrowing / refutation', morph: 'acc. sg. f.' },
  erroris: { lemma: 'error', gloss: 'of error', morph: 'gen. sg. m.' },
  argumentativo: { lemma: 'argumentativus', gloss: 'argumentative / demonstrative', morph: 'abl. sg.' },
  partes: { lemma: 'pars', gloss: 'parts', morph: 'acc./nom. pl. f.' },
  dividitur: { lemma: 'divido', gloss: 'is divided', morph: '3sg pres. pass.' },
  prosequitur: { lemma: 'prosequor', gloss: 'pursues / treats at length', morph: '3sg pres. dep.' },
  finito: { lemma: 'finio', gloss: 'having been finished / completed', morph: 'perf. pass. part. abl.' },
  prooemio: { lemma: 'prooemium', gloss: 'the prologue', morph: 'abl. sg. n.' },
};

const SCHOLASTIC_PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bAd primum sic proceditur\b/gi, 'We proceed thus to the first point'],
  [/\bAd secundum sic proceditur\b/gi, 'We proceed thus to the second point'],
  [/\bAd tertium sic proceditur\b/gi, 'We proceed thus to the third point'],
  [/\bAd quartum sic proceditur\b/gi, 'We proceed thus to the fourth point'],
  [/\bAd quintum sic proceditur\b/gi, 'We proceed thus to the fifth point'],
  [/\bAd sextum sic proceditur\b/gi, 'We proceed thus to the sixth point'],
  [/\bAd septimum sic proceditur\b/gi, 'We proceed thus to the seventh point'],
  [/\bAd octavum sic proceditur\b/gi, 'We proceed thus to the eighth point'],
  [/\bAd nonum sic proceditur\b/gi, 'We proceed thus to the ninth point'],
  [/\bAd decimum sic proceditur\b/gi, 'We proceed thus to the tenth point'],
  [/\bVidetur quod non sit necessarium\b/gi, 'It seems that it is not necessary'],
  [/\bVidetur quod\b/gi, 'It seems that'],
  [/\bSed contra est quod dicitur\b/gi, 'On the contrary, it is said in'],
  [/\bSed contra est quod\b/gi, 'On the contrary,'],
  [/\bRespondeo dicendum quod\b/gi, 'I answer that it must be said that'],
  [/\bRespondeo dicendum\b/gi, 'I answer that'],
  [/\bAd primum ergo dicendum quod\b/gi, 'In reply to the first objection, therefore, it must be said that'],
  [/\bAd secundum dicendum quod\b/gi, 'In reply to the second objection, it must be said that'],
  [/\bAd tertium dicendum quod\b/gi, 'In reply to the third objection, it must be said that'],
  [/\bAd quartum dicendum quod\b/gi, 'In reply to the fourth objection, it must be said that'],
  [/\bEt per hoc patet responsio ad obiecta\b/gi, 'And from this the reply to the objections is evident'],
];

const IRREGULAR_PAST_PARTICIPLES: Record<string, string> = {
  be: 'been',
  bear: 'borne',
  beat: 'beaten',
  become: 'become',
  begin: 'begun',
  bend: 'bent',
  bind: 'bound',
  bring: 'brought',
  build: 'built',
  buy: 'bought',
  catch: 'caught',
  choose: 'chosen',
  come: 'come',
  cut: 'cut',
  do: 'done',
  draw: 'drawn',
  drink: 'drunk',
  drive: 'driven',
  eat: 'eaten',
  fall: 'fallen',
  feed: 'fed',
  feel: 'felt',
  find: 'found',
  flee: 'fled',
  forbid: 'forbidden',
  forget: 'forgotten',
  forgive: 'forgiven',
  forsake: 'forsaken',
  give: 'given',
  go: 'gone',
  grow: 'grown',
  have: 'had',
  hear: 'heard',
  hide: 'hidden',
  hold: 'held',
  hurt: 'hurt',
  keep: 'kept',
  know: 'known',
  lay: 'laid',
  lead: 'led',
  leave: 'left',
  let: 'let',
  lie: 'lain',
  lose: 'lost',
  make: 'made',
  mean: 'meant',
  meet: 'met',
  overcome: 'overcome',
  pay: 'paid',
  put: 'put',
  read: 'read',
  rise: 'risen',
  run: 'run',
  say: 'said',
  see: 'seen',
  seek: 'sought',
  sell: 'sold',
  send: 'sent',
  set: 'set',
  shake: 'shaken',
  shed: 'shed',
  shine: 'shone',
  show: 'shown',
  shut: 'shut',
  sing: 'sung',
  sit: 'sat',
  slay: 'slain',
  speak: 'spoken',
  spend: 'spent',
  spread: 'spread',
  stand: 'stood',
  strike: 'struck',
  strive: 'striven',
  swear: 'sworn',
  sweep: 'swept',
  take: 'taken',
  teach: 'taught',
  tear: 'torn',
  tell: 'told',
  think: 'thought',
  throw: 'thrown',
  understand: 'understood',
  undertake: 'undertaken',
  wear: 'worn',
  win: 'won',
  write: 'written',
};

function toPastParticiple(verbPhrase: string): string {
  const clean = verbPhrase.replace(/^to\s+/i, '').trim();
  const words = clean.split(/\s+/);
  if (words.length === 0 || !words[0]) return clean;
  const first = words[0].toLowerCase().replace(/\/.*$/, '');
  let pp: string;
  if (IRREGULAR_PAST_PARTICIPLES[first]) {
    pp = IRREGULAR_PAST_PARTICIPLES[first];
  } else if (first.endsWith('eed') || first.endsWith('ed')) {
    pp = first;
  } else if (first.endsWith('e')) {
    pp = `${first}d`;
  } else if (/[^aeiou]y$/.test(first)) {
    pp = `${first.slice(0, -1)}ied`;
  } else {
    pp = `${first}ed`;
  }
  return [pp, ...words.slice(1)].join(' ');
}

function extractConciseGloss(rawSenses: string): string {
  const cleaned = rawSenses
    .replace(/^Thomistic technical term\s*(?:\([^)]*\))?\s*:\s*/i, '')
    .replace(/^Technical Scholastic\s*\/?\s*Thomistic term[^.;]*[.;]?\s*/i, '')
    .split('|')[0]
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .trim();
  const firstClause = cleaned
    .split(';')[0]
    .split(',')[0]
    .split('.')[0]
    .trim();
  if (/thomistic technical term|technical scholastic/i.test(firstClause)) {
    return '';
  }
  return firstClause || cleaned.slice(0, 32).trim();
}

function formatMorphShort(wordAnalysis: ReturnType<typeof analyzeWord>): string {
  const top = wordAnalysis.morphologicalParses[0];
  if (!top) return wordAnalysis.partOfSpeech.slice(0, 12);
  if (top.rawPos === 'N' || top.rawPos === 'ADJ' || top.rawPos === 'PRON') {
    const c = top.case ? top.case.slice(0, 3).toLowerCase() + '.' : '';
    const n = top.number ? top.number.slice(0, 2).toLowerCase() + '.' : '';
    return `${c} ${n}`.trim() || top.pos;
  }
  if (top.rawPos === 'V') {
    if (top.mood === 'Infinitive') return 'inf.';
    const p = top.person ? top.person[0] : '';
    const n = top.number ? top.number[0].toLowerCase() : '';
    const t = top.tense ? top.tense.slice(0, 4).toLowerCase() + '.' : '';
    const m = top.mood === 'Subjunctive' ? 'subj.' : '';
    const v = top.voice === 'Passive' ? 'pass.' : '';
    return [p + n, t, v, m].filter(Boolean).join(' ');
  }
  if (top.rawPos === 'VPAR') {
    return top.pos.includes('Gerundive') ? 'gerundive' : 'part.';
  }
  return top.pos.slice(0, 10).toLowerCase();
}

export function lookupReferenceTranslation(
  citation?: string,
  latinParagraph?: string
): string | undefined {
  if (
    latinParagraph &&
    /^et\s+per\s+hoc\s+patet\s+responsio\s+ad\s+obiecta\.?$/i.test(latinParagraph.trim())
  ) {
    return 'This suffices for the Replies to the Objections.';
  }
  if (citation) {
    const summaSections = getSummaSections();
    const norm = citation
      .replace(/\u00AA/g, '')
      .replace(/\u00BA/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (summaSections[norm]) return summaSections[norm];
    if (summaSections[norm + '.']) return summaSections[norm + '.'];
    if (norm.endsWith('.') && summaSections[norm.slice(0, -1)]) {
      return summaSections[norm.slice(0, -1)];
    }
  }
  return undefined;
}

const PROPER_NOUNS: Record<string, { lemma: string; gloss: string; morph: string }> = {
  dorix: { lemma: 'Dorix', gloss: 'Dorix', morph: 'proper name' },
  eccli: { lemma: 'Ecclesiasticus', gloss: 'Ecclesiasticus', morph: 'book of Scripture' },
  christus: { lemma: 'Christus', gloss: 'Christ', morph: 'proper name' },
  christum: { lemma: 'Christus', gloss: 'Christ', morph: 'acc. sg. m.' },
  christi: { lemma: 'Christus', gloss: 'of Christ', morph: 'gen. sg. m.' },
  christo: { lemma: 'Christus', gloss: 'in/with Christ', morph: 'dat./abl. sg. m.' },
  deus: { lemma: 'Deus', gloss: 'God', morph: 'nom. sg. m.' },
  dei: { lemma: 'Deus', gloss: 'of God', morph: 'gen. sg. m.' },
  deo: { lemma: 'Deus', gloss: 'to/by God', morph: 'dat./abl. sg. m.' },
  deum: { lemma: 'Deus', gloss: 'God', morph: 'acc. sg. m.' },
  dominus: { lemma: 'Dominus', gloss: 'the Lord', morph: 'nom. sg. m.' },
  domine: { lemma: 'Dominus', gloss: 'O Lord', morph: 'voc. sg. m.' },
  spiritus: { lemma: 'spiritus', gloss: 'spirit', morph: 'nom. sg. m.' },
  sanctus: { lemma: 'sanctus', gloss: 'holy', morph: 'adj.' },
  filius: { lemma: 'filius', gloss: 'Son / son', morph: 'nom. sg. m.' },
  filium: { lemma: 'filius', gloss: 'Son / son', morph: 'acc. sg. m.' },
  patris: { lemma: 'pater', gloss: "of the Father / father's", morph: 'gen. sg. m.' },
  ego: { lemma: 'ego', gloss: 'I', morph: '1sg pron.' },
  effudi: { lemma: 'effundo', gloss: 'I poured forth', morph: '1sg perf. act.' },
  flumina: { lemma: 'flumen', gloss: 'rivers / torrents / streams', morph: 'acc. pl. n.' },
  fluvius: { lemma: 'fluvius', gloss: 'river', morph: 'nom. sg. m.' },
  trames: { lemma: 'trames', gloss: 'path / footpath / watercourse', morph: 'nom. sg. m.' },
  aquae: { lemma: 'aqua', gloss: 'of water', morph: 'gen. sg. f.' },
  immensae: { lemma: 'immensus', gloss: 'boundless / immeasurable', morph: 'gen. sg. f.' },
  defluo: { lemma: 'defluo', gloss: 'I flow down / glide down', morph: '1sg pres. act.' },
  sicut: { lemma: 'sicut', gloss: 'just as / as', morph: 'conj.' },
  aquaeductus: { lemma: 'aquaeductus', gloss: 'aqueduct / channel of waters', morph: 'nom. sg. m.' },
  exivi: { lemma: 'exeo', gloss: 'I went forth / came forth', morph: '1sg perf. act.' },
  paradiso: { lemma: 'paradisus', gloss: 'Paradise', morph: 'abl. sg. m.' },
  dixi: { lemma: 'dico', gloss: 'I said', morph: '1sg perf. act.' },
  rigabo: { lemma: 'rigo', gloss: 'I will water / irrigate', morph: '1sg fut. act.' },
  hortum: { lemma: 'hortus', gloss: 'garden', morph: 'acc. sg. m.' },
  plantationum: { lemma: 'plantatio', gloss: 'of plantings / grafts', morph: 'gen. pl. f.' },
  inebriabo: { lemma: 'inebrio', gloss: 'I will saturate / give deep drink', morph: '1sg fut. act.' },
  pratus: { lemma: 'pratum', gloss: 'of the meadow / pasture', morph: 'gen. sg. n.' },
  mei: { lemma: 'meus', gloss: 'my', morph: 'gen. sg.' },
  fructum: { lemma: 'fructus', gloss: 'fruit', morph: 'acc. sg. m.' },
  sapientia: { lemma: 'sapientia', gloss: 'Wisdom', morph: 'nom. sg. f.' },
  sapientiam: { lemma: 'sapientia', gloss: 'Wisdom', morph: 'acc. sg. f.' },
  sapientiae: { lemma: 'sapientia', gloss: 'of Wisdom', morph: 'gen. sg. f.' },
  apostolus: { lemma: 'apostolus', gloss: 'the Apostle', morph: 'nom. sg. m.' },
  protulit: { lemma: 'profero', gloss: 'brought forth / declared', morph: '3sg perf. act.' },
  dicens: { lemma: 'dico', gloss: 'saying', morph: 'pres. part.' },
  virtutem: { lemma: 'virtus', gloss: 'power / virtue', morph: 'acc. sg. f.' },
  sapientissima: { lemma: 'sapiens', gloss: 'most wise', morph: 'superl.' },
  sapientissimam: { lemma: 'sapiens', gloss: 'most wise', morph: 'superl. acc. sg. f.' },
  aeternus: { lemma: 'aeternus', gloss: 'eternal', morph: 'adj.' },
  aeternitas: { lemma: 'aeternitas', gloss: 'eternity', morph: 'nom. sg. f.' },
  aeternitatis: { lemma: 'aeternitas', gloss: 'of eternity', morph: 'gen. sg. f.' },
  invisibilis: { lemma: 'invisibilis', gloss: 'invisible', morph: 'adj.' },
  imago: { lemma: 'imago', gloss: 'image / likeness', morph: 'nom. sg. f.' },
  imaginem: { lemma: 'imago', gloss: 'image / likeness', morph: 'acc. sg. f.' },
  similitudo: { lemma: 'similitudo', gloss: 'likeness', morph: 'nom. sg. f.' },
  similitudinem: { lemma: 'similitudo', gloss: 'likeness', morph: 'acc. sg. f.' },
  creator: { lemma: 'creator', gloss: 'Creator', morph: 'nom. sg. m.' },
  creatura: { lemma: 'creatura', gloss: 'creature', morph: 'nom. sg. f.' },
  creaturae: { lemma: 'creatura', gloss: 'of the creature / of creation', morph: 'gen. sg. f.' },
  creaturas: { lemma: 'creatura', gloss: 'creatures', morph: 'acc. pl. f.' },
  creaturis: { lemma: 'creatura', gloss: 'creatures', morph: 'dat./abl. pl. f.' },
  creaturarum: { lemma: 'creatura', gloss: 'of creatures', morph: 'gen. pl. f.' },
  caelum: { lemma: 'caelum', gloss: 'heaven', morph: 'nom./acc. sg. n.' },
  caeli: { lemma: 'caelum', gloss: 'of heaven / heavens', morph: 'gen. sg. n.' },
  caelis: { lemma: 'caelum', gloss: 'the heavens', morph: 'dat./abl. pl. n.' },
  terra: { lemma: 'terra', gloss: 'earth', morph: 'nom. sg. f.' },
  terrae: { lemma: 'terra', gloss: 'of the earth', morph: 'gen. sg. f.' },
  terram: { lemma: 'terra', gloss: 'earth', morph: 'acc. sg. f.' },
  ecclesia: { lemma: 'Ecclesia', gloss: 'the Church', morph: 'nom. sg. f.' },
  ecclesiae: { lemma: 'Ecclesia', gloss: 'of the Church', morph: 'gen. sg. f.' },
  ecclesiam: { lemma: 'Ecclesia', gloss: 'the Church', morph: 'acc. sg. f.' },
  gratiam: { lemma: 'gratia', gloss: 'grace', morph: 'acc. sg. f.' },
  gratiae: { lemma: 'gratia', gloss: 'of grace', morph: 'gen. sg. f.' },
  caritas: { lemma: 'caritas', gloss: 'charity', morph: 'nom. sg. f.' },
  caritatis: { lemma: 'caritas', gloss: 'of charity', morph: 'gen. sg. f.' },
  fide: { lemma: 'fides', gloss: 'by/in faith', morph: 'abl. sg. f.' },
  fidei: { lemma: 'fides', gloss: 'of faith', morph: 'gen. sg. f.' },
  fidem: { lemma: 'fides', gloss: 'faith', morph: 'acc. sg. f.' },
  iustitia: { lemma: 'iustitia', gloss: 'justice / righteousness', morph: 'nom. sg. f.' },
  iustitiae: { lemma: 'iustitia', gloss: 'of justice', morph: 'gen. sg. f.' },
  peccatum: { lemma: 'peccatum', gloss: 'sin', morph: 'nom./acc. sg. n.' },
  peccata: { lemma: 'peccatum', gloss: 'sins', morph: 'nom./acc. pl. n.' },
  beatitudinem: { lemma: 'beatitudo', gloss: 'beatitude / happiness', morph: 'acc. sg. f.' },
  gloria: { lemma: 'gloria', gloss: 'glory', morph: 'nom. sg. f.' },
  gloriam: { lemma: 'gloria', gloss: 'glory', morph: 'acc. sg. f.' },
  gloriae: { lemma: 'gloria', gloss: 'of glory', morph: 'gen. sg. f.' },
  sacramentum: { lemma: 'sacramentum', gloss: 'sacrament', morph: 'nom./acc. sg. n.' },
  sacramenta: { lemma: 'sacramentum', gloss: 'sacraments', morph: 'nom./acc. pl. n.' },
  sacramentis: { lemma: 'sacramentum', gloss: 'by/with the sacraments', morph: 'dat./abl. pl. n.' },
};

function normalizeNounGloss(base: string, number?: string): string {
  if (number !== 'Plural') return base;
  // If base is already clearly plural or has slash alternatives, keep as-is
  if (/s$|\/|,| and /.test(base)) return base;
  return `${base}s`;
}

export function translateLatinSentence(
  sentence: string,
  citation?: string,
  latinParagraph?: string
): SentenceTranslationResult {
  const rawTokens = sentence.trim().split(/\s+/).filter(Boolean);
  const interlinearGloss: InterlinearToken[] = [];

  for (const rawTok of rawTokens) {
    const clean = cleanLatinString(rawTok);
    if (!clean) continue;

    const preset = PROPER_NOUNS[clean] || SCHOLASTIC_TOKEN_GLOSSES[clean];
    if (preset) {
      interlinearGloss.push({
        word: rawTok,
        lemma: preset.lemma,
        gloss: preset.gloss,
        morphShort: preset.morph,
      });
      continue;
    }

    const analysis = analyzeWord(rawTok);
    const topParse = analysis.morphologicalParses[0];

    let baseSense = '';
    if (analysis.isThomisticKeyTerm) {
      baseSense = extractConciseGloss(analysis.ecclesiasticalMeaning);
    }
    if (!baseSense && topParse) {
      baseSense = extractConciseGloss(topParse.entry.senses);
    }
    if (!baseSense) {
      const wikEntry = analysis.dictionaryEntries.find((d) => d.source === 'Wiktionary');
      if (wikEntry) {
        baseSense = extractConciseGloss(wikEntry.definition.replace(/\(\d+\)\s*/g, ''));
      }
    }
    if (!baseSense) {
      baseSense = rawTok.replace(/[,;:.?!]+$/, '').toLowerCase();
    }

    let inflectedGloss = baseSense;
    if (topParse) {
      if (topParse.rawPos === 'N') {
        const nounGloss = normalizeNounGloss(baseSense, topParse.number);
        if (topParse.case === 'Genitive') inflectedGloss = `of ${nounGloss}`;
        else if (topParse.case === 'Dative') inflectedGloss = `to/for ${nounGloss}`;
        else if (topParse.case === 'Ablative') inflectedGloss = `by/in ${nounGloss}`;
        else inflectedGloss = nounGloss;
      } else if (topParse.rawPos === 'V') {
        if (topParse.mood === 'Infinitive') {
          inflectedGloss =
            topParse.voice === 'Passive' && !topParse.entry.extra.includes('DEP')
              ? `to be ${toPastParticiple(baseSense)}`
              : baseSense.startsWith('to ')
              ? baseSense
              : `to ${baseSense}`;
        } else if (topParse.voice === 'Passive' && !topParse.entry.extra.includes('DEP') && !baseSense.startsWith('be ')) {
          const aux = topParse.number === 'Plural' ? 'are' : 'is';
          inflectedGloss = `${aux} ${toPastParticiple(baseSense)}`;
        }
      } else if (topParse.pos.includes('Gerundive')) {
        inflectedGloss = `to be ${toPastParticiple(baseSense)}`;
      }
    }

    interlinearGloss.push({
      word: rawTok,
      lemma: analysis.primaryLemma,
      gloss: inflectedGloss,
      morphShort: formatMorphShort(analysis),
    });
  }

  // Build literal translation from interlinear tokens + Scholastic phrase templates
  let literalTranslation = interlinearGloss
    .map((t) => {
      const puncMatch = t.word.match(/([,;:.?!]+)$/);
      return puncMatch ? `${t.gloss}${puncMatch[1]}` : t.gloss;
    })
    .join(' ');

  for (const [pattern, replacement] of SCHOLASTIC_PHRASE_REPLACEMENTS) {
    if (pattern.test(sentence)) {
      literalTranslation = `${replacement} — ${literalTranslation}`;
      break;
    }
  }

  const fullSectionRef = lookupReferenceTranslation(citation, latinParagraph || sentence);
  let matchedRefSentence: string | undefined;

  if (fullSectionRef && latinParagraph) {
    const latSentences = splitIntoSentences(latinParagraph);
    const enSentences = fullSectionRef
      .split(/(?<=[.?!])\s+(?=[A-Z"'])/)
      .map((s) => s.trim())
      .filter(Boolean);
    const idx = latSentences.findIndex((s) => s.trim() === sentence.trim());
    if (idx >= 0 && enSentences.length > 0) {
      const mappedIdx = Math.min(
        enSentences.length - 1,
        Math.floor((idx / Math.max(1, latSentences.length)) * enSentences.length)
      );
      matchedRefSentence = enSentences[mappedIdx];
    }
  }

  // Only claim a contextual English sentence translation when we have an authoritative reference.
  // Without a reference we return an empty string so the UI shows a labeled phrase-by-phrase guide instead of fabricated fluent prose.
  const contextualTranslation = matchedRefSentence || fullSectionRef || '';

  return {
    interlinearGloss,
    literalTranslation,
    contextualTranslation,
    referenceTranslation: fullSectionRef,
  };
}
