#!/usr/bin/env python3
"""
Builds the multi-source lexical, morphological, Thomistic, Ecclesiastical, Wiktionary,
Lewis & Short, and parallel translation datasets for the Schola Thomistica browser extension:
  1. whitaker-dict.json       (Whitaker's Words 38,088 entries, stems, uniques, addons)
  2. whitaker-inflects.json   (Whitaker's Words 1,797 inflectional rules)
  3. thomistic-lexicon.json   (Schütz Thomas-Lexikon parsed from archive/tl*.html + Curated Thomistic Layer)
  4. ecclesiastical-dict.json (Ecclesiastical, Liturgical, Biblical/Vulgate, Patristic & Scholastic Latin Dictionary)
  5. wiktionary-latin.json    (Wiktionary Latin-English definitions + Victionarium etymologies & senses)
  6. lewis-short-core.json    (Expanded Lewis & Short Latin Dictionary covering 18,000+ lemmas across A–V)
  7. summa-english.json       (English Dominican translation of the Summa Theologiae keyed by Corpus Thomisticum TITLE citations)
"""

import concurrent.futures
import html
import json
import os
import re
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
ARCHIVE_DIR = ROOT_DIR / "archive"
DATA_DIR = ROOT_DIR / "src" / "data"
CACHE_DIR = ROOT_DIR / ".cache_sources"


def download_cached(url: str, filename: str) -> bytes:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    target = CACHE_DIR / filename
    if target.exists() and target.stat().st_size > 0:
        return target.read_bytes()
    print(f"[build-data] Downloading {url} -> {filename}")
    req = urllib.request.Request(url, headers={"User-Agent": "ScholaThomistica/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    target.write_bytes(data)
    return data


def reconstruct_whitaker_lemma(entry: dict) -> list[str]:
    s1, s2, s3, s4 = entry["stems"]
    pos = entry["pos"]
    decl = entry["decl"]
    var = entry["var"]
    extra = entry["extra"]
    out: list[str] = []

    def add(w: str) -> None:
        w_norm = w.strip().lower().replace("j", "i")
        if w_norm and w_norm != "zzz" and w_norm not in out:
            out.append(w_norm)

    if pos == "N":
        gender = extra.split()[0] if extra else ""
        if decl == 1 and s1:
            add(f"{s1}a")
        elif decl == 2 and s1:
            if gender == "N":
                add(f"{s1}um")
            elif var == 3:
                add(s1)
            else:
                add(f"{s1}us")
        elif decl == 3:
            if s1:
                add(s1)
            if s2:
                add(f"{s2}is")
        elif decl == 4 and s1:
            add(f"{s1}u" if gender == "N" else f"{s1}us")
        elif decl == 5 and s1:
            add(f"{s1}es")
        elif s1:
            add(s1)
    elif pos == "V":
        is_dep = "DEP" in (extra or "")
        if decl == 1 and s1:
            add(f"{s1}or" if is_dep else f"{s1}o")
        elif decl == 2 and s1:
            add(f"{s1}eor" if is_dep else f"{s1}eo")
        elif decl == 3 and s1:
            add(f"{s1}or" if is_dep else f"{s1}o")
        elif decl == 5 and s1 == "s" and s2 == "f":
            add("sum")
            add("esse")
        elif s1:
            add(s1)
    elif pos == "ADJ" and s1:
        if decl == 1:
            add(f"{s1}us")
        elif decl == 3:
            add(s1)
            if s2:
                add(f"{s2}is")
        else:
            add(s1)
    elif pos in ("ADV", "PREP", "CONJ", "INTERJ") and s1:
        add(s1)
    return out


def build_whitaker() -> tuple[dict, dict]:
    dictline_raw = download_cached(
        "https://raw.githubusercontent.com/mk270/whitakers-words/master/DICTLINE.GEN",
        "DICTLINE.GEN",
    ).decode("utf-8", errors="ignore")
    inflects_raw = download_cached(
        "https://raw.githubusercontent.com/mk270/whitakers-words/master/INFLECTS.LAT",
        "INFLECTS.LAT",
    ).decode("utf-8", errors="ignore")
    uniques_raw = download_cached(
        "https://raw.githubusercontent.com/mk270/whitakers-words/master/UNIQUES.LAT",
        "UNIQUES.LAT",
    ).decode("utf-8", errors="ignore")
    addons_raw = download_cached(
        "https://raw.githubusercontent.com/mk270/whitakers-words/master/ADDONS.LAT",
        "ADDONS.LAT",
    ).decode("utf-8", errors="ignore")

    entries = []
    for line in dictline_raw.splitlines():
        if len(line) < 110:
            continue
        s1 = line[0:19].strip()
        s2 = line[19:38].strip()
        s3 = line[38:57].strip()
        s4 = line[57:76].strip()
        pos = line[76:83].strip()
        gram = line[83:100].strip()
        flags = line[100:110].strip().split()
        gloss = line[110:].strip()

        if gloss.startswith("|") and entries:
            entries[-1]["senses"] += " " + gloss.lstrip("|").strip()
            continue

        gram_parts = gram.split()
        decl = int(gram_parts[0]) if len(gram_parts) >= 1 and gram_parts[0].isdigit() else 0
        var = int(gram_parts[1]) if len(gram_parts) >= 2 and gram_parts[1].isdigit() else 0
        extra = " ".join(gram_parts[2:]) if len(gram_parts) > 2 else (gram if not decl else "")

        age = flags[0] if len(flags) > 0 else "X"
        area = flags[1] if len(flags) > 1 else "X"
        freq = flags[3] if len(flags) > 3 else "X"

        entries.append(
            {
                "stems": [s1, s2, s3, s4],
                "pos": pos,
                "decl": decl,
                "var": var,
                "extra": extra,
                "age": age,
                "area": area,
                "freq": freq,
                "senses": gloss,
            }
        )

    uniques: dict[str, list[dict]] = {}
    u_lines = [l.strip() for l in uniques_raw.splitlines() if l.strip() and not l.strip().startswith("--")]
    i = 0
    while i + 2 < len(u_lines):
        form = u_lines[i].lower()
        gram_line = u_lines[i + 1]
        meaning = u_lines[i + 2]
        parts = gram_line.split()
        pos = parts[0] if parts else "X"
        morph = " ".join(parts[1:-5]) if len(parts) > 6 else gram_line
        uniques.setdefault(form, []).append({"pos": pos, "morph": morph, "senses": meaning})
        i += 3

    prefixes = []
    suffixes = []
    tackons = [
        {"particle": "que", "meaning": "and (enclitic conjunction -que)"},
        {"particle": "ne", "meaning": "whether / interrogative particle (-ne)"},
        {"particle": "ve", "meaning": "or (enclitic conjunction -ve)"},
        {"particle": "cum", "meaning": "with (enclitic preposition -cum, e.g., mecum, secum, quibuscum)"},
        {"particle": "met", "meaning": "self / own (intensive enclitic -met, e.g., egomet, sibimet)"},
        {"particle": "pte", "meaning": "own / proper (intensive suffix -pte, e.g., suapte)"},
        {"particle": "ce", "meaning": "this here (deictic enclitic -ce, e.g., huiusce)"},
    ]
    a_lines = [l.strip() for l in addons_raw.splitlines() if l.strip() and not l.strip().startswith("--")]
    j = 0
    while j < len(a_lines):
        header = a_lines[j].split()
        if not header:
            j += 1
            continue
        kind = header[0]
        if kind in ("PREFIX", "SUFFIX") and j + 2 < len(a_lines):
            affix = header[1].lower() if len(header) > 1 else ""
            connect = header[2].lower() if len(header) > 2 else ""
            meta = a_lines[j + 1]
            gloss = a_lines[j + 2]
            if kind == "PREFIX" and affix:
                prefixes.append({"prefix": affix, "connect": connect, "meta": meta, "meaning": gloss})
            elif kind == "SUFFIX" and affix:
                suffixes.append({"suffix": affix, "meta": meta, "meaning": gloss})
            j += 3
        else:
            j += 1

    inflect_rules = []
    for raw in inflects_raw.splitlines():
        line = raw.split("--")[0].strip()
        if not line:
            continue
        tokens = line.split()
        if len(tokens) < 4:
            continue
        pos = tokens[0]
        age = tokens[-2]
        freq = tokens[-1]
        body = tokens[1:-2]

        if len(body) >= 2 and body[-1].isdigit() and body[-2].isdigit():
            stem_idx = int(body[-2])
            ending = ""
            mid = body[:-2]
        elif len(body) >= 3 and body[-2].isdigit() and body[-3].isdigit():
            stem_idx = int(body[-3])
            ending = body[-1].lower()
            mid = body[:-3]
        else:
            continue

        decl = 0
        var = 0
        morph = ""
        if pos in ("N", "ADJ", "V", "VPAR", "SUPINE", "PRON", "NUM") and len(mid) >= 2:
            if mid[0].isdigit() and mid[1].isdigit():
                decl = int(mid[0])
                var = int(mid[1])
                morph = " ".join(mid[2:])
            else:
                morph = " ".join(mid)
        else:
            morph = " ".join(mid)

        inflect_rules.append(
            {
                "pos": pos,
                "decl": decl,
                "var": var,
                "morph": morph,
                "stem": stem_idx,
                "ending": ending,
                "age": age,
                "freq": freq,
            }
        )

    return (
        {
            "entries": entries,
            "uniques": uniques,
            "prefixes": prefixes,
            "suffixes": suffixes,
            "tackons": tackons,
        },
        {"rules": inflect_rules},
    )


CURATED_THOMISTIC_TERMS = {
    "actus": {
        "headword": "actus, -us (m.)",
        "partOfSpeech": "Noun (4th decl. masc.)",
        "thomisticMeaning": "Act, actuality, fulfillment, or operation (rendering Aristotle's energeia / entelecheia). Divided into actus primus (substantial form / habit) and actus secundus (operation), and actus essendi (the act of existing). God is Actus Purus (Pure Act).",
        "ecclesiasticalMeaning": "Liturgical action, moral human act (actus humanus, proceeding from deliberate will), or canonical act.",
        "classicalMeaning": "Driving of cattle, impulse, motion, performance of a play, or legal right of way.",
        "scholasticNote": "In Aquinas, every creature is composed of actus and potentia; essence itself is in potency to the act of being (esse). Watch for 'in actu' (actually) vs. 'in potentia' (potentially).",
    },
    "potentia": {
        "headword": "potentia, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Potency, potentiality, capacity, or faculty/power of the soul (Aristotle's dynamis). Divided into potentia activa (active power), potentia passiva (passive capacity to receive perfection), and potentia oboedientialis (capacity of nature for supernatural elevation by God).",
        "ecclesiasticalMeaning": "Spiritual power/faculty of the soul (intellect, will, senses); divine omnipotence.",
        "classicalMeaning": "Political might, influence, force, or authority.",
        "scholasticNote": "Never translate 'potentia' in metaphysical contexts merely as 'political power': when paired with 'actus' or 'habitus', it means 'potency/potentiality' or 'faculty of the soul'.",
    },
    "essentia": {
        "headword": "essentia, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Essence; that by which a thing is what it is (quod quid erat esse / quidditas). In created substances, essence is really distinct from its act of existence (esse); in God alone, His essence is His very act of existing (Ipsum Esse Subsistens).",
        "ecclesiasticalMeaning": "Divine Essence (the one nature of the Father, Son, and Holy Spirit in Trinitarian theology).",
        "classicalMeaning": "Rare philosophical neologism coined (according to Seneca and Quintilian) to translate Greek 'ousia'.",
        "scholasticNote": "Synonyms with distinct nuances in Aquinas: 'essentia' (insofar as through it a being has esse), 'quidditas' (what is expressed by the definition), and 'natura' (essence ordered to operation).",
    },
    "existentia": {
        "headword": "existentia, -ae (f.) / exsistentia",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Existence; the state or fact of actual subsistence outside its causes. Aquinas himself prefers the verbal infinitive 'esse' (actus essendi) to express the metaphysical act by which an essence subsists.",
        "ecclesiasticalMeaning": "Actual subsistence or reality of a thing.",
        "classicalMeaning": "Post-classical philosophical coinage from ex(s)isto ('to step forth, emerge').",
        "scholasticNote": "In Scholasticism, 'essentia' answers 'quid est?' (what is it?), whereas 'esse / existentia' answers 'an est?' (whether it exists).",
    },
    "esse": {
        "headword": "esse (from sum, esse, fui, futurus)",
        "partOfSpeech": "Substantivized Infinitive / Verb",
        "thomisticMeaning": "Being, the act of existing (actus essendi); the actuality of all acts and perfection of all perfections ('actualitas omnium actuum et propter hoc est perfectio omnium perfectionum', De Pot. q. 7 a. 2 ad 9).",
        "ecclesiasticalMeaning": "To be, to exist; divine subsistence.",
        "classicalMeaning": "To be, exist, live, stay.",
        "scholasticNote": "When Aquinas uses 'esse' as a noun (e.g., 'ipsum esse', 'suum esse', 'secundum esse'), translate as 'the act of being' or 'existence'.",
    },
    "sum": {
        "headword": "sum, esse, fui, futurus",
        "partOfSpeech": "Verb (Irregular Copula)",
        "thomisticMeaning": "To be, to exist, to subsist. In Scholastic logic and metaphysics, 'est' functions either as a copula uniting predicate to subject (expressing the truth of a proposition, 'ens ut verum') or as an absolute predicate affirming actual existence in reality ('actus essendi').",
        "ecclesiasticalMeaning": "To be, exist ('Ego sum qui sum', Exod. 3:14 — God as Ipsum Esse Subsistens).",
        "classicalMeaning": "To be, exist, live, abide.",
        "scholasticNote": "Distinguish copulative 'est' (which can be said even of privations like blindness, because the proposition is true) from existential 'est' (real act of being).",
    },
    "ens": {
        "headword": "ens, entis (n./part.)",
        "partOfSpeech": "Substantivized Participle / Noun (3rd decl.)",
        "thomisticMeaning": "Being, a being, that which is (id quod habet esse). The first concept that falls into the intellect and the primary transcendental (convertible with unum, verum, bonum).",
        "ecclesiasticalMeaning": "An existing entity; Ens Summum / Ens a se (God).",
        "classicalMeaning": "Rare participial coin from sum (translating Greek 'to on').",
        "scholasticNote": "Distinguish 'ens' (a concrete being, 'that which is') from 'esse' (the act of being) and 'essentia' (what the being is).",
    },
    "substantia": {
        "headword": "substantia, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Substance; a being to whose nature it belongs to exist in itself and not in another as in a subject ('ens per se subsistens'). Divided into substantia prima (individual subsisting thing) and substantia secunda (universal nature).",
        "ecclesiasticalMeaning": "Consubstantial divine nature (Credo: 'consubstantialem Patri') or the underlying reality of bread and wine converted in the Eucharist.",
        "classicalMeaning": "Resources, property, wealth, or material contents.",
        "scholasticNote": "Contrasted with 'accidens' (the nine accidental categories that exist in a substance as in a subject).",
    },
    "accidens": {
        "headword": "accidens, accidentis (n.)",
        "partOfSpeech": "Noun / Participle (3rd decl. neut.)",
        "thomisticMeaning": "Accident; a reality whose nature is to exist in another as in a subject ('cuius esse est inesse'), such as quantity, quality, relation, action, passion, time, place, posture, or habit.",
        "ecclesiasticalMeaning": "Eucharistic accidents (species of bread and wine remaining after transubstantiation).",
        "classicalMeaning": "An unforeseen occurrence, chance event, or misfortune.",
        "scholasticNote": "Key phrases: 'per accidens' (incidentally / through an extrinsic cause) vs. 'per se' (essentially / by its own nature).",
    },
    "doctrina": {
        "headword": "doctrina, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Teaching, doctrine, or systematic body of knowledge; especially 'sacra doctrina' (sacred doctrine / theology proceeding from divine revelation, ST I, q. 1).",
        "ecclesiasticalMeaning": "Christian teaching, catechesis, authoritative Church doctrine.",
        "classicalMeaning": "Instruction, learning, erudition, science.",
        "scholasticNote": "In ST I, q. 1, Aquinas uses 'sacra doctrina' to encompass the entire body of divinely revealed truth in Scripture and sacred tradition.",
    },
    "scientia": {
        "headword": "scientia, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Demonstrative knowledge or science (Aristotle's episteme): certain knowledge of conclusions acquired through demonstration from principles (cognitio certa per causas), and an intellectual virtue.",
        "ecclesiasticalMeaning": "One of the seven gifts of the Holy Spirit (donum scientiae); God's omniscience.",
        "classicalMeaning": "Knowledge, skill, acquaintance with a subject.",
        "scholasticNote": "In Scholastic Latin, 'scientia' means any rigorous body of demonstrative knowledge from principles (including metaphysics, ethics, and theology as a subalternated science).",
    },
    "sapientia": {
        "headword": "sapientia, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Wisdom; the highest intellectual virtue and gift of the Holy Spirit that considers the highest causes (causas altissimas) and orders and judges all other sciences ('sapientis est ordinare et iudicare').",
        "ecclesiasticalMeaning": "Divine Wisdom (the Word/Son of God in Wisdom literature and Christology); the highest of the seven gifts of the Holy Spirit.",
        "classicalMeaning": "Good sense, prudence, practical wisdom, philosophy.",
        "scholasticNote": "In ST I, q. 1 a. 6, Aquinas distinguishes wisdom acquired by study (metaphysics and sacred theology) from infused wisdom (the gift of the Holy Spirit).",
    },
    "gratia": {
        "headword": "gratia, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Divine Grace; a supernatural gift freely bestowed by God upon rational creatures toward eternal life (gratia habitualis / sanctifying grace, gratia actualis, and gratia gratis data).",
        "ecclesiasticalMeaning": "Supernatural grace of God, favor, thanksgiving ('Deo gratias', 'Ave Maria, gratia plena').",
        "classicalMeaning": "Favor, esteem, charm, pleasantness, gratitude; 'gratia' (+ gen.) = for the sake of.",
        "scholasticNote": "Core Thomistic axiom: 'Gratia non tollit naturam, sed perficit' ('Grace does not destroy nature, but perfects it', ST I, q. 1 a. 8 ad 2).",
    },
    "sacramentum": {
        "headword": "sacramentum, -i (n.)",
        "partOfSpeech": "Noun (2nd decl. neut.)",
        "thomisticMeaning": "Sacrament; a sensible sign of a sacred thing insofar as it sanctifies human beings ('signum rei sacrae inquantum est sanctificans homines', ST III, q. 60 a. 2), effecting the grace it signifies.",
        "ecclesiasticalMeaning": "One of the seven sacraments of the Church (Baptism, Confirmation, Eucharist, Penance, Anointing, Orders, Matrimony); mystery of faith (translating Greek mysterion in the Vulgate).",
        "classicalMeaning": "A military oath of allegiance taken by Roman soldiers, or a sum of money deposited by litigants in a civil suit.",
        "scholasticNote": "A classic example where Classical Latin ('military oath / legal deposit') is completely misleading in Ecclesiastical and Thomistic texts.",
    },
    "fides": {
        "headword": "fides, fidei (f.)",
        "partOfSpeech": "Noun (5th decl. fem.)",
        "thomisticMeaning": "Faith; the first of the three theological virtues (fides, spes, caritas), an infused habit by which the intellect, moved by the will under divine grace, assents firmly to truths revealed by God.",
        "ecclesiasticalMeaning": "The Catholic Faith, Creed, or supernatural virtue of faith.",
        "classicalMeaning": "Trust, reliability, credit, pledge, promise, good faith.",
        "scholasticNote": "Aquinas distinguishes 'credere Deo' (believing God as witness), 'credere Deum' (believing the truth about God), and 'credere in Deum' (tending toward God through faith formed by charity).",
    },
    "caritas": {
        "headword": "caritas, caritatis (f.)",
        "partOfSpeech": "Noun (3rd decl. fem.)",
        "thomisticMeaning": "Charity; the supreme theological virtue and 'form of all the virtues' (forma virtutum), defined by Aquinas as a certain friendship of man for God ('amicitia quaedam hominis ad Deum', ST II-II, q. 23 a. 1).",
        "ecclesiasticalMeaning": "Supernatural love of God above all things and of neighbor for God's sake (translating Greek agape in 1 Cor. 13 and 1 John 4: 'Deus caritas est').",
        "classicalMeaning": "Dearness, high price, scarcity of provisions, or natural family affection/esteem.",
        "scholasticNote": "Never translate 'caritas' in Aquinas as 'high price' or merely 'almsgiving'; it is the theological virtue of supernatural love/friendship with God.",
    },
    "ratio": {
        "headword": "ratio, rationis (f.)",
        "partOfSpeech": "Noun (3rd decl. fem.)",
        "thomisticMeaning": "Reason, intelligible nature/concept, formal aspect, or argument: (1) the faculty of discursive human reason; (2) the formal intelligible aspect or definition ('ratio formalis obiecti'); (3) a logical argument ('rationes inducere'); (4) an exemplar idea in the divine mind.",
        "ecclesiasticalMeaning": "Human reason (as distinct from divine revelation) or formal intelligibility.",
        "classicalMeaning": "Reckoning, account, calculation, business affair, plan, method.",
        "scholasticNote": "Crucial idiom: 'sub ratione X' = 'under the formal aspect of X'; 'secundum rationem' = 'according to concept/reason' (as opposed to 'secundum rem', in reality).",
    },
    "intellectus": {
        "headword": "intellectus, -us (m.)",
        "partOfSpeech": "Noun (4th decl. masc.)",
        "thomisticMeaning": "Intellect or understanding (Aristotle's nous). Divided into intellectus agens (agent intellect) and intellectus possibilis (possible intellect), as well as the intellectual habit of first principles (habitus principiorum).",
        "ecclesiasticalMeaning": "Spiritual faculty of understanding; one of the seven gifts of the Holy Spirit (donum intellectus).",
        "classicalMeaning": "Perception, comprehension, meaning, sense.",
        "scholasticNote": "'Intelligere' is the simple apprehension of intelligible truth, while 'ratiocinari' is moving from one thing understood to another (ST I, q. 79 a. 8).",
    },
    "habitus": {
        "headword": "habitus, -us (m.)",
        "partOfSpeech": "Noun (4th decl. masc.)",
        "thomisticMeaning": "Habit or stable disposition (Aristotle's hexis): a stable quality in a power of the soul disposing it well or ill toward its operation (virtues, vices, sciences). Also the 10th Aristotelian category.",
        "ecclesiasticalMeaning": "Virtuous or vicious disposition of soul; monastic/religious habit.",
        "classicalMeaning": "Condition, plight, physical posture, dress, attire.",
        "scholasticNote": "In Thomistic ethics, a 'habitus' is not a mechanical reflex, but a stable qualitative perfection enabling free, prompt, and joyful rational action.",
    },
    "forma": {
        "headword": "forma, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Form (Aristotle's morphe / eidos): the intrinsic determining principle of a thing. Divided into forma substantialis (substantial form) and forma accidentalis (accidental form).",
        "ecclesiasticalMeaning": "Sacramental form (the operative words spoken in administering a sacrament, united to the sacramental matter).",
        "classicalMeaning": "Outward shape, figure, physical beauty, mold, stamp.",
        "scholasticNote": "Axiom: 'Forma dat esse rei' ('Form gives being to a thing').",
    },
    "materia": {
        "headword": "materia, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Matter (Aristotle's hyle): the intrinsic potential principle of changeable things. Divided into materia prima (prime matter) and materia secunda / signata (designated matter, the principle of individuation).",
        "ecclesiasticalMeaning": "Sacramental matter (e.g., water in Baptism, bread and wine in the Eucharist); subject-matter of a treatise or moral act.",
        "classicalMeaning": "Timber, building wood, stuff, material, topic.",
        "scholasticNote": "Watch for 'materia quantitate signata' (matter designated by quantity, the principle of individuation of material substances).",
    },
    "obiectum": {
        "headword": "obiectum, -i (n.)",
        "partOfSpeech": "Noun (2nd decl. neut.)",
        "thomisticMeaning": "Object; the reality to which a power, habit, or act is directed. Divided into obiectum materiale (the thing known/willed) and obiectum formale ('ratio formalis obiecti', which specifies the power or science, ST I, q. 1 a. 3).",
        "ecclesiasticalMeaning": "Object of faith, hope, charity, or moral action.",
        "classicalMeaning": "Something thrown in the way, a charge ('obiecta' = objections).",
        "scholasticNote": "Notice both senses in ST I, q. 1: 'obiectum potentiae' (formal object) and 'ad obiecta' ('in reply to the objections').",
    },
    "subiectum": {
        "headword": "subiectum, -i (n.)",
        "partOfSpeech": "Noun (2nd decl. neut.)",
        "thomisticMeaning": "Subject; (1) the underlying substrate that receives forms or accidents; (2) the subject of a proposition or primary subject-matter ('subiectum scientiae', ST I, q. 1 a. 7) of a science.",
        "ecclesiasticalMeaning": "The subject of a science, virtue, or sacrament.",
        "classicalMeaning": "That which lies beneath, a subordinate or inferior.",
        "scholasticNote": "In Scholastic Latin, 'subiectum' means the real underlying substance or subject-matter of a science—the opposite of modern 'subjective'.",
    },
    "species": {
        "headword": "species, speciei (f.)",
        "partOfSpeech": "Noun (5th decl. fem.)",
        "thomisticMeaning": "(1) Logical species (composed of genus and specific difference); (2) Intentional cognitive likeness ('species sensibilis' and 'species intelligibilis') by which the intellect knows the thing; (3) Beauty.",
        "ecclesiasticalMeaning": "Eucharistic species (the appearances of bread and wine after consecration).",
        "classicalMeaning": "Sight, look, outward appearance, pretext, kind, sort.",
        "scholasticNote": "The 'species intelligibilis' is the likeness *by which* (id quo) the intellect understands the extramental thing itself (ST I, q. 85 a. 2).",
    },
    "quidditas": {
        "headword": "quidditas, quidditatis (f.)",
        "partOfSpeech": "Noun (3rd decl. fem.)",
        "thomisticMeaning": "Quiddity or 'whatness'; the essence of a thing insofar as it is signified by its definition answering 'quid est?'.",
        "ecclesiasticalMeaning": "Essential nature of a reality.",
        "classicalMeaning": "Medieval Scholastic coinage from 'quid' ('what').",
        "scholasticNote": "The proper object of the human intellect in this life is the 'quidditas rei materialis'.",
    },
    "simpliciter": {
        "headword": "simpliciter",
        "partOfSpeech": "Adverb",
        "thomisticMeaning": "Simply speaking, unqualifiedly, absolutely, without qualification (contrasted with 'secundum quid', in a certain respect).",
        "ecclesiasticalMeaning": "Unqualifiedly, absolutely.",
        "classicalMeaning": "Simply, plainly, directly, frankly.",
        "scholasticNote": "Essential Scholastic distinction: 'simpliciter' (absolutely) vs. 'secundum quid' (in a certain respect).",
    },
    "inquantum": {
        "headword": "inquantum (in quantum)",
        "partOfSpeech": "Conjunction / Adverbial Compound",
        "thomisticMeaning": "Inasmuch as, insofar as, to the extent that (indicating the formal aspect under which a predicate belongs to a subject).",
        "ecclesiasticalMeaning": "Insofar as, to the extent that.",
        "classicalMeaning": "To what extent, as far as (written 'in quantum').",
        "scholasticNote": "Essential Scholastic operator of formal specification: 'inquantum huiusmodi' = 'insofar as it is such'.",
    },
    "videtur": {
        "headword": "videtur (from video, videre, vidi, visum)",
        "partOfSpeech": "Verb (3rd sg. pres. pass. ind.)",
        "thomisticMeaning": "'It seems (that)...' — the standard Scholastic formula introducing the first objection ('Videtur quod...') in an article.",
        "ecclesiasticalMeaning": "It seems, it appears.",
        "classicalMeaning": "It is seen, it seems good.",
        "scholasticNote": "In the Summa Theologiae, 'Videtur quod...' ALWAYS introduces an initial objection, not Aquinas's own conclusion.",
    },
    "praeterea": {
        "headword": "praeterea",
        "partOfSpeech": "Adverb",
        "thomisticMeaning": "'Furthermore / Moreover' — introduces the second, third, and subsequent objections in a Scholastic article.",
        "ecclesiasticalMeaning": "Furthermore, besides.",
        "classicalMeaning": "Besides, beyond this, hereafter.",
        "scholasticNote": "Marks each additional objection after the first.",
    },
    "respondeo": {
        "headword": "respondeo, respondere, respondi, responsum",
        "partOfSpeech": "Verb (2nd conj.)",
        "thomisticMeaning": "In 'Respondeo dicendum quod...' ('I answer that it must be said that...'), introduces the 'Corpus' or magistral determination of the article.",
        "ecclesiasticalMeaning": "To answer, respond liturgically or magisterially.",
        "classicalMeaning": "To answer, reply, give a legal opinion.",
        "scholasticNote": "'Respondeo dicendum quod' marks the heart of every article (abbreviated 'co.').",
    },
    "beatitudo": {
        "headword": "beatitudo, beatitudinis (f.)",
        "partOfSpeech": "Noun (3rd decl. fem.)",
        "thomisticMeaning": "Beatitude, ultimate happiness, blessedness; man's ultimate supernatural end consisting in the beatific vision of the Divine Essence (ST I-II, qq. 1–5).",
        "ecclesiasticalMeaning": "Eternal blessedness in heaven; the Evangelical Beatitudes.",
        "classicalMeaning": "Good fortune, happiness, felicity (coined by Cicero).",
        "scholasticNote": "Aquinas distinguishes 'beatitudo imperfecta' (natural happiness in this life) from 'beatitudo perfecta' (the supernatural vision of God).",
    },
    "revelatio": {
        "headword": "revelatio, revelationis (f.)",
        "partOfSpeech": "Noun (3rd decl. fem.)",
        "thomisticMeaning": "Divine Revelation; the supernatural unveiling of truths by God to humanity, providing the principles of sacred doctrine (sacra doctrina).",
        "ecclesiasticalMeaning": "Divine revelation, prophetic manifestation, Apocalypse.",
        "classicalMeaning": "Uncovering, laying bare (coined in Christian Latin by Tertullian/Vulgate).",
        "scholasticNote": "In ST I, q. 1 a. 1, Aquinas explains why divine revelation is necessary both for truths exceeding reason and for truths about God accessible to reason.",
    },
    "persona": {
        "headword": "persona, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Person; 'an individual substance of a rational nature' ('rationalis naturae individua substantia', Boethius, ST I, q. 29 a. 1).",
        "ecclesiasticalMeaning": "Divine Person (Father, Son, Holy Spirit in the Trinity) or human person.",
        "classicalMeaning": "Theatrical mask worn by actors, dramatic role, character, legal party.",
        "scholasticNote": "In Trinitarian theology, the three Divine Persons are subsistent relations ('relationes subsistentes') in one Divine Essence.",
    },
    "virtus": {
        "headword": "virtus, virtutis (f.)",
        "partOfSpeech": "Noun (3rd decl. fem.)",
        "thomisticMeaning": "(1) Virtue: a good operative habit ('habitus operativus bonus', ST I-II, q. 55); (2) Active power, force, or efficacy of a cause ('in virtute principiorum').",
        "ecclesiasticalMeaning": "Moral or theological virtue; miracle; Choir of Angels (Virtutes).",
        "classicalMeaning": "Manliness, courage, valor, military excellence, worth.",
        "scholasticNote": "'Habitus virtutis' = 'habit of virtue', whereas 'in virtute X' = 'by the power/virtuality of X'.",
    },
    "causa": {
        "headword": "causa, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Cause; a principle on which another depends for its being or becoming: causa materialis, formalis, efficiens/agens, and finalis ('causa causarum').",
        "ecclesiasticalMeaning": "First Cause (Causa Prima, God) and secondary causes.",
        "classicalMeaning": "Judicial lawsuit, case, pretext, motive, reason.",
        "scholasticNote": "In Aquinas, the final cause is the 'cause of causes' ('causa causarum').",
    },
    "finis": {
        "headword": "finis, finis (m./f.)",
        "partOfSpeech": "Noun (3rd decl.)",
        "thomisticMeaning": "End, goal, purpose, or final cause ('id cuius gratia aliquid fit'); divided into finis operis vs. finis operantis, and proximate vs. ultimate end (finis ultimus).",
        "ecclesiasticalMeaning": "Ultimate end of man (God); consummation of the world.",
        "classicalMeaning": "Boundary, border, limit, territory (pl. fines), termination.",
        "scholasticNote": "Axiom: 'Finis est primum in intentione, ultimum in executione'.",
    },
    "salus": {
        "headword": "salus, salutis (f.)",
        "partOfSpeech": "Noun (3rd decl. fem.)",
        "thomisticMeaning": "Salvation; eternal spiritual salvation and beatitude in God ('tota hominis salus, quae in Deo est', ST I, q. 1 a. 1 co.).",
        "ecclesiasticalMeaning": "Eternal salvation of the soul, redemption in Christ ('nostra salus').",
        "classicalMeaning": "Physical health, soundness, bodily safety, welfare, or a greeting.",
        "scholasticNote": "In ST I, q. 1 a. 1 ('necessarium fuit ad humanam salutem'), 'salus' means man's supernatural salvation in the vision of God.",
    },
    "theologia": {
        "headword": "theologia, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Theology ('sermo de Deo'). Divided into philosophical theology (metaphysics) and theology belonging to sacred doctrine (sacra doctrina, under the light of divine revelation).",
        "ecclesiasticalMeaning": "Sacred Theology, the science of faith.",
        "classicalMeaning": "Mythological or philosophical account of the gods.",
        "scholasticNote": "Theology in sacra doctrina differs in genus from philosophical theology because of its formal light (lumen divinae revelationis).",
    },
    "scriptura": {
        "headword": "scriptura, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Sacred Scripture (Sacra Scriptura); the divinely inspired canonical books of the Old and New Testaments, expounded according to literal and spiritual senses (allegorical, moral/tropological, anagogical, ST I, q. 1 a. 10).",
        "ecclesiasticalMeaning": "Holy Scripture, the written Word of God.",
        "classicalMeaning": "Writing, composition, tax on public pastures.",
        "scholasticNote": "All spiritual senses of Scripture are founded upon the literal sense (ST I, q. 1 a. 10 ad 1).",
    },
    "principium": {
        "headword": "principium, -ii (n.)",
        "partOfSpeech": "Noun (2nd decl. neut.)",
        "thomisticMeaning": "Principle; 'that from which something proceeds in any way whatsoever' ('id a quo aliquid procedit quocumque modo', ST I, q. 33 a. 1).",
        "ecclesiasticalMeaning": "Origin within the Trinity; first truth/article of faith; opening of Genesis/John ('In principio').",
        "classicalMeaning": "Beginning, commencement, origin, foundation.",
        "scholasticNote": "Every cause is a principle, but not every principle is a cause.",
    },
    "natura": {
        "headword": "natura, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Nature; the essence of a thing insofar as it is the intrinsic principle of its proper operation and motion (ST I, q. 29 a. 1 ad 4).",
        "ecclesiasticalMeaning": "Created nature (perfected by grace); the divine and human natures united in the one Person of Christ.",
        "classicalMeaning": "Birth, character, disposition, the physical universe.",
        "scholasticNote": "Distinguish 'essentia' (what a thing is), 'natura' (essence as principle of operation), and 'persona / suppositum' (the concrete individual).",
    },
    "anima": {
        "headword": "anima, -ae (f.)",
        "partOfSpeech": "Noun (1st decl. fem.)",
        "thomisticMeaning": "Soul; the first principle of life in living things and the substantial form of the body ('actus primus corporis physici organici', ST I, q. 75 a. 1).",
        "ecclesiasticalMeaning": "The immortal human soul created immediately by God.",
        "classicalMeaning": "Air, breeze, breath of life, vital principle.",
        "scholasticNote": "Aquinas defends the unity of substantial form in man: the one rational soul is the substantial form of the human body.",
    },
    "voluntas": {
        "headword": "voluntas, voluntatis (f.)",
        "partOfSpeech": "Noun (3rd decl. fem.)",
        "thomisticMeaning": "Will; the rational appetite (appetitus intellectivus) which tends toward the good apprehended by the intellect (bonum intellectum).",
        "ecclesiasticalMeaning": "The divine will ('fiat voluntas tua') and human free will.",
        "classicalMeaning": "Wish, desire, inclination, good-will, last will/testament.",
        "scholasticNote": "The will naturally desires happiness (beatitudo) in general, and exercises free choice (liberum arbitrium) regarding means to the end.",
    },
    "veritas": {
        "headword": "veritas, veritatis (f.)",
        "partOfSpeech": "Noun (3rd decl. fem.)",
        "thomisticMeaning": "Truth; the conformity or adequation of thing and intellect ('adaequatio rei et intellectus', ST I, q. 16 a. 1).",
        "ecclesiasticalMeaning": "Divine Truth (Christ as 'Via, Veritas, et Vita', John 14:6; God as Prima Veritas).",
        "classicalMeaning": "Truthfulness, reality, honesty, integrity.",
        "scholasticNote": "The transcendental 'verum' (the true) is convertible with 'ens' (being): 'nihil enim scitur nisi verum, quod cum ente convertitur' (ST I, q. 1 a. 1 arg. 2).",
    },
}


def strip_tags(raw_html: str) -> str:
    clean = re.sub(r"<[^>]+>", "", raw_html)
    clean = html.unescape(clean)
    return re.sub(r"\s+", " ", clean).strip()


def build_thomistic_lexicon(whitaker_entries: list[dict]) -> dict:
    whitaker_by_stem: dict[str, str] = {}
    for e in whitaker_entries:
        for lem in reconstruct_whitaker_lemma(e):
            if lem not in whitaker_by_stem:
                whitaker_by_stem[lem] = e["senses"]
        for s in e["stems"]:
            if s and s != "zzz" and s.lower() not in whitaker_by_stem:
                whitaker_by_stem[s.lower()] = e["senses"]

    entries: dict[str, dict] = {}
    for key, val in CURATED_THOMISTIC_TERMS.items():
        entries[key] = {
            **val,
            "schuetzSenses": [],
            "aquinasQuotes": [],
            "aquinasCitations": [],
            "axioms": [],
            "compounds": [],
        }

    head_re = re.compile(
        r'<DIV CLASS="cuatrog"><A NAME="([^"]+)">([^<]+)</A></DIV>(.*?)(?=<DIV CLASS="cuatrog"><A NAME=|<DIV CLASS="centro">|\Z)',
        re.DOTALL | re.IGNORECASE,
    )
    tras_re = re.compile(r'<SPAN CLASS="tras">(.*?)</SPAN>', re.DOTALL | re.IGNORECASE)
    cita_re = re.compile(r'<SPAN CLASS="cita">(.*?)</SPAN>', re.DOTALL | re.IGNORECASE)
    rf_re = re.compile(r'<SPAN CLASS="rf">(.*?)</SPAN>', re.DOTALL | re.IGNORECASE)
    sent_re = re.compile(r'<SPAN CLASS="sent">(.*?)</SPAN>', re.DOTALL | re.IGNORECASE)
    vox_re = re.compile(r'<SPAN CLASS="vox">(.*?)</SPAN>', re.DOTALL | re.IGNORECASE)

    for letter in "abcdefghilmnopqrstuvz":
        tl_file = ARCHIVE_DIR / f"tl{letter}.html"
        if not tl_file.exists():
            continue
        raw = tl_file.read_bytes().decode("iso-8859-1", errors="ignore")
        for match in head_re.finditer(raw):
            anchor = match.group(1).strip().lower()
            headword = strip_tags(match.group(2))
            block = match.group(3)

            senses = [strip_tags(m) for m in tras_re.findall(block) if strip_tags(m)]
            quotes = [strip_tags(m) for m in cita_re.findall(block) if len(strip_tags(m)) > 8][:6]
            citations = [strip_tags(m) for m in rf_re.findall(block) if strip_tags(m)][:6]
            axioms = [strip_tags(m) for m in sent_re.findall(block) if strip_tags(m)][:5]
            compounds = [strip_tags(m) for m in vox_re.findall(block) if strip_tags(m)][:10]

            base_word = headword.split(",")[0].split()[0].strip().lower()
            lookup_key = anchor if anchor.isalpha() else base_word
            if not lookup_key:
                continue

            w_def = (
                whitaker_by_stem.get(lookup_key)
                or whitaker_by_stem.get(lookup_key[:-1])
                or whitaker_by_stem.get(lookup_key[:-2])
                or whitaker_by_stem.get(lookup_key[:-3])
                or whitaker_by_stem.get(lookup_key[:-4])
                or ""
            )

            existing = entries.get(lookup_key, {})
            if existing.get("thomisticMeaning"):
                thomistic_meaning = existing["thomisticMeaning"]
            elif w_def:
                thomistic_meaning = f"{w_def}" + (
                    f" | Schütz Thomas-Lexikon ({headword}): {'; '.join(senses[:4])}" if senses else ""
                )
            else:
                thomistic_meaning = (
                    f"{headword}: {'; '.join(senses[:4])}"
                    if senses
                    else f"{headword} (Scholastic term in Thomas Aquinas)"
                )
            classical_meaning = existing.get("classicalMeaning") or w_def or headword

            entries[lookup_key] = {
                "headword": existing.get("headword") or headword,
                "partOfSpeech": existing.get("partOfSpeech") or "Scholastic / Latin Term",
                "thomisticMeaning": thomistic_meaning,
                "ecclesiasticalMeaning": existing.get("ecclesiasticalMeaning") or w_def,
                "classicalMeaning": classical_meaning,
                "scholasticNote": existing.get("scholasticNote")
                or (
                    f"Documented in Ludwig Schütz's Thomas-Lexikon ({f'tl{letter}.html#{anchor}'}) "
                    f"with {len(quotes)} Thomistic usage examples."
                ),
                "schuetzSenses": senses[:6],
                "aquinasQuotes": quotes,
                "aquinasCitations": citations,
                "axioms": axioms,
                "compounds": compounds,
            }

    return {"entries": entries}


def build_ecclesiastical_dictionary(whitaker_entries: list[dict], thomistic_entries: dict) -> dict:
    ecc_entries: dict[str, dict] = {}

    # 1. Download liturgical.json from ecclesia-dev/latin
    lit_phrases_by_word: dict[str, list[str]] = {}
    try:
        lit_raw = download_cached(
            "https://raw.githubusercontent.com/ecclesia-dev/latin/main/data/liturgical.json",
            "liturgical.json",
        )
        lit_data = json.loads(lit_raw.decode("utf-8", errors="ignore"))
        for section_items in lit_data.values():
            if not isinstance(section_items, list):
                continue
            for item in section_items:
                lat = item.get("latin", "")
                eng = item.get("english", "")
                if lat and eng:
                    for tok in re.findall(r"[A-Za-z]+", lat):
                        w = tok.lower().replace("j", "i")
                        if len(w) >= 3:
                            lit_phrases_by_word.setdefault(w, []).append(f'"{lat}" ({eng})')
    except Exception as exc:
        print(f"[build-data] Warning loading liturgical.json: {exc}")

    # 2. Seed from curated & Thomistic entries
    for k, val in thomistic_entries.items():
        ecc_sense = val.get("ecclesiasticalMeaning") or val.get("thomisticMeaning", "")
        cls_sense = val.get("classicalMeaning", "")
        lit_examples = lit_phrases_by_word.get(k, [])[:2]
        definition = ecc_sense
        if cls_sense and cls_sense != ecc_sense:
            definition += f" — [Classical contrast: {cls_sense}]"
        if lit_examples:
            definition += f" • Liturgical usage: {'; '.join(lit_examples)}"
        ecc_entries[k] = {
            "headword": val.get("headword", k),
            "definition": definition,
            "period": "Ecclesiastical, Patristic & Scholastic Latin",
        }

    # 3. Extract all Ecclesiastical (area=='E') and Late/Patristic/Medieval/Scholastic (age in D,E,F) from Whitaker
    age_names = {
        "D": "Late / Patristic Latin (4th–6th c., Vulgate & Church Fathers)",
        "E": "Medieval & Scholastic Latin (7th–14th c.)",
        "F": "Scholastic & Neo-Latin (15th c.+)",
    }
    for e in whitaker_entries:
        is_ecc = e["area"] == "E" or e["age"] in ("D", "E", "F")
        if not is_ecc and e["freq"] not in ("A", "B", "C"):
            continue
        lemmas = reconstruct_whitaker_lemma(e)
        if not lemmas:
            continue
        primary = lemmas[0]
        label = (
            "Ecclesiastical / Church Latin"
            if e["area"] == "E"
            else age_names.get(e["age"], "Ecclesiastical & General Latin Usage")
        )
        lit_examples = lit_phrases_by_word.get(primary, [])[:2]
        defn = e["senses"]
        if lit_examples:
            defn += f" • Liturgical usage: {'; '.join(lit_examples)}"

        for lem in lemmas:
            if lem not in ecc_entries or e["area"] == "E":
                ecc_entries[lem] = {
                    "headword": primary,
                    "definition": defn,
                    "period": label,
                }

    return {"entries": ecc_entries}


def build_wiktionary_dictionary(whitaker_entries: list[dict], thomistic_entries: dict) -> dict:
    wik_entries: dict[str, dict] = {}

    # 1. Load Victionarium (nikita-moor/latin-dictionary/Victionarium/lexicon.json)
    try:
        vic_raw = download_cached(
            "https://raw.githubusercontent.com/nikita-moor/latin-dictionary/master/Victionarium/lexicon.json",
            "victionarium_lexicon.json",
        )
        vic_items = json.loads(vic_raw.decode("utf-8", errors="ignore"))
        for item in vic_items:
            hw = (item.get("headword") or "").strip().lower().replace("j", "i")
            if not hw:
                continue
            raw_def = strip_tags(item.get("def") or "")
            raw_etym = strip_tags(item.get("etym") or "")
            if raw_def:
                wik_entries[hw] = {
                    "headword": item.get("headword", hw),
                    "pos": item.get("pos", "Latin"),
                    "definition": raw_def[:420],
                    "etymology": raw_etym[:220] if raw_etym else "",
                    "sourceUrl": f"https://en.wiktionary.org/wiki/{hw}#Latin",
                }
    except Exception as exc:
        print(f"[build-data] Warning loading Victionarium: {exc}")

    # 2. Fetch English Wiktionary REST API definitions for core Thomistic & prologue vocabulary (cached in .cache_sources)
    en_wik_cache_path = CACHE_DIR / "wiktionary_en_cache.json"
    en_wik_cache: dict[str, dict] = {}
    if en_wik_cache_path.exists():
        try:
            en_wik_cache = json.loads(en_wik_cache_path.read_text(encoding="utf-8"))
        except Exception:
            en_wik_cache = {}

    priority_words = sorted(
        set(CURATED_THOMISTIC_TERMS.keys())
        | {
            "ego", "sapientia", "effundo", "flumen", "quasi", "trames", "aqua", "immensus",
            "defluo", "fluvius", "sicut", "aquaeductus", "exeo", "paradisus", "dico", "rigo",
            "hortus", "plantatio", "inebrio", "pratum", "meus", "fructus", "multus", "sententia",
            "diversus", "prodeo", "verus", "apostolus", "profero", "christus", "deus", "virtus",
            "filius", "pater", "spiritus", "sanctus", "unus", "essentia", "modus", "opus",
            "manifesto", "occultus", "produco", "creatura", "restauro", "perficio", "perfectio",
            "perfectus", "finis", "attingo", "cognosco", "origo", "verbum", "trinitas", "homo",
            "mundus", "ecclesia", "sacramentum", "gloria", "resurrectio", "doctrina", "sacer",
            "necessarius", "philosophicus", "disciplina", "habeo", "ratio", "conor", "sufficio",
            "trado", "superfluus", "ens", "scio", "converto", "philosophia", "theologia",
            "divinus", "scriptura", "utilis", "doceo", "arguo", "corripio", "erudio", "iustitia",
            "humanus", "invenio", "salus", "revelatio", "investigo", "ordino", "comprehendo",
            "praecognosco", "intentio", "actio", "paucus", "tempus", "error", "cognitio",
            "dependeo", "fides", "suscipio", "sensus", "ostendo", "diversitas", "conclusio",
            "demonstro", "terra", "rotundus", "medium", "materia", "abstraho", "considero",
            "lumen", "naturalis", "genus", "principium", "articulus", "concedo", "singularis",
            "exemplum", "vita", "moralis", "auctoritas", "vir", "procedo", "unitas", "potentia",
            "habitus", "obiectum", "formalis", "communico", "creator", "angelus", "corporalis",
            "mos", "practicus", "operatio", "speculativus", "lex", "vetus", "novus", "aedificium",
            "aeternus", "certitudo", "dignitas", "dubito", "ancilla", "transcendo", "errare",
            "decipio", "altitudo", "exercitus", "civitas", "bonum", "intellectus", "noctua",
            "sol", "desiderabilis", "minimus", "defectus", "manuduco", "suppono", "caput",
            "studium", "acquiro", "infusio", "donum", "iudico", "iudicium", "artifex", "domus",
            "prudentia", "universus", "communis", "inclinatio", "regula", "mensura", "patior",
            "subiectum", "impossibilis", "sermo", "effectus", "gratia", "definitio", "pars",
            "accidens", "signum", "reparatio", "membrum", "argumentum", "tollo", "credo",
            "infirmus", "meritum", "experimentum", "episcopus", "contradico", "haereticus",
            "metaphysica", "adversarius", "solvo", "probatio", "efficax", "voluntas", "caritas",
            "poeta", "probabilis", "canonicus", "propheta", "metaphora", "similitudo", "repraesentatio",
            "poetica", "infimus", "occulto", "corporalis", "radius", "velamen", "rudis",
            "delectabilis", "figura", "elevo", "exercitium", "studiosus", "irrisio", "infidelis",
            "nobilis", "vilis", "liber", "error", "proprietas", "excogito", "aestimatio",
            "indignus", "littera", "historicus", "litteralis", "allegoricus", "tropologicus",
            "anagogicus", "multiplicitas", "confusio", "fallacia", "historia", "aetiologia",
            "analogia", "allegoria", "parabolicus", "significo", "fundamentum",
        }
    )

    missing_words = [w for w in priority_words if w not in en_wik_cache]
    if missing_words:
        print(f"[build-data] Fetching {len(missing_words)} priority Latin lemmas from English Wiktionary REST API...")

        def fetch_one_wik(word: str) -> tuple[str, dict | None]:
            url = f"https://en.wiktionary.org/api/rest_v1/page/definition/{urllib.parse.quote(word)}"
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "ScholaThomistica/1.0"})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode("utf-8", errors="ignore"))
                la_secs = data.get("la", [])
                if not la_secs:
                    return word, None
                pos_list = []
                defs = []
                for sec in la_secs:
                    pos = sec.get("partOfSpeech", "")
                    if pos and pos not in pos_list:
                        pos_list.append(pos)
                    for d in sec.get("definitions", [])[:3]:
                        clean_d = strip_tags(d.get("definition", ""))
                        if clean_d and clean_d not in defs:
                            defs.append(clean_d)
                if defs:
                    return word, {
                        "headword": word,
                        "pos": ", ".join(pos_list) or "Latin",
                        "definition": " • ".join(f"({idx + 1}) {df}" for idx, df in enumerate(defs[:4])),
                        "sourceUrl": f"https://en.wiktionary.org/wiki/{word}#Latin",
                    }
            except Exception:
                pass
            return word, None

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
            for w, res in pool.map(fetch_one_wik, missing_words):
                if res:
                    en_wik_cache[w] = res

        en_wik_cache_path.write_text(json.dumps(en_wik_cache, ensure_ascii=False, indent=2), encoding="utf-8")

    for w, entry in en_wik_cache.items():
        existing_vic = wik_entries.get(w)
        defn = entry["definition"]
        if existing_vic and existing_vic.get("definition"):
            defn += f" | [Victionarium (LA): {existing_vic['definition'][:180]}]"
        wik_entries[w] = {
            "headword": entry.get("headword", w),
            "pos": entry.get("pos", "Latin"),
            "definition": defn,
            "etymology": existing_vic.get("etymology", "") if existing_vic else "",
            "sourceUrl": f"https://en.wiktionary.org/wiki/{w}#Latin",
        }

    # 3. Ensure every high-frequency Whitaker lemma also has a Wiktionary-compatible entry & link
    for e in whitaker_entries:
        if e["freq"] not in ("A", "B", "C", "D") and e["area"] != "E":
            continue
        lemmas = reconstruct_whitaker_lemma(e)
        if not lemmas:
            continue
        primary = lemmas[0]
        senses_parts = [s.strip() for s in e["senses"].split(";") if s.strip()]
        numbered = " • ".join(f"({idx + 1}) {sp}" for idx, sp in enumerate(senses_parts[:4]))
        for lem in lemmas:
            if lem not in wik_entries:
                wik_entries[lem] = {
                    "headword": primary,
                    "pos": e["pos"],
                    "definition": numbered,
                    "etymology": "",
                    "sourceUrl": f"https://en.wiktionary.org/wiki/{primary}#Latin",
                }

    return {"entries": wik_entries}


def build_lewis_short(whitaker_entries: list[dict], thomistic_entries: dict) -> dict:
    ls_entries: dict[str, dict] = {}
    letters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "X", "Y"]
    target_lemmas = set(thomistic_entries.keys())
    for e in whitaker_entries:
        if e["freq"] in ("A", "B", "C", "D", "E") or e["age"] in ("D", "E", "F") or e["area"] == "E":
            for lem in reconstruct_whitaker_lemma(e):
                target_lemmas.add(lem.lower().replace("j", "i").replace("v", "u"))
                target_lemmas.add(lem.lower().replace("j", "i"))

    for letter in letters:
        try:
            raw = download_cached(
                f"https://raw.githubusercontent.com/IohannesArnold/lewis-short-json/master/ls_{letter}.json",
                f"ls_{letter}.json",
            )
            items = json.loads(raw.decode("utf-8", errors="ignore"))
            for item in items:
                raw_key = re.sub(r"[0-9_]+$", "", item.get("key", "")).lower().replace("j", "i")
                key_u = raw_key.replace("v", "u")
                if not raw_key:
                    continue
                if raw_key in target_lemmas or key_u in target_lemmas:
                    notes = item.get("main_notes", "")
                    senses_list = []
                    for s in item.get("senses", [])[:4]:
                        if isinstance(s, str):
                            senses_list.append(s)
                        elif isinstance(s, dict):
                            senses_list.append(s.get("sense", "") or str(s))
                    combined = re.sub(r"\s+", " ", (notes + " " + " ".join(senses_list))).strip()
                    if combined:
                        entry_obj = {
                            "headword": item.get("key", raw_key),
                            "orthography": item.get("orthography", raw_key),
                            "definition": combined[:450] + ("..." if len(combined) > 450 else ""),
                        }
                        if raw_key not in ls_entries:
                            ls_entries[raw_key] = entry_obj
                        if key_u not in ls_entries:
                            ls_entries[key_u] = entry_obj
        except Exception as exc:
            print(f"[build-data] Warning on ls_{letter}.json: {exc}")

    return {"entries": ls_entries}


def build_summa_english() -> dict:
    parts = ["I", "I-II", "II-II", "III", "Suppl"]
    sections: dict[str, str] = {
        "Summa theologiae, pr.": (
            "Because the Master of Catholic truth ought not only to teach the proficient, "
            "but also to instruct beginners, according to the Apostle: As unto little ones in Christ, "
            "I gave you milk to drink, not meat (1 Cor. 3:1–2); our purpose in this work is to treat of "
            "whatever belongs to the Christian religion, in such a way as may tend to the instruction of beginners. "
            "We have considered that students in this doctrine have not seldom been hampered by what they have found "
            "written by other authors, partly on account of the multiplication of useless questions, articles, and arguments; "
            "partly also because those things that are needful for them to know are not taught according to the order of the "
            "subject-matter, but according as the plan of the book might require, or the occasion of disputing might offer; "
            "partly, too, because frequent repetition brought weariness and confusion to the minds of the readers. "
            "Endeavoring to avoid these and other like faults, we shall try, by God's help, to set forth whatever is included "
            "in Sacred Doctrine as briefly and clearly as the matter itself may allow."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 pr.": (
            "With the prologue finished, here begins the present work, in which the Master intends to hand on to us "
            "the doctrine of divine things with a view to the investigation of truth and the refutation of error; "
            "hence he also proceeds in an argumentative manner. This work is divided into two main parts: in the first "
            "he treats of divine things as they go forth from their principle; in the second, as they return to their end (Book IV). "
            "Here at the outset of Distinction 1, it must be considered whether the virtues are to be used (utendum) or enjoyed (fruendum). "
            "Now the things to be considered in this doctrine fall under consideration according as we are joined through them to our ultimate end. "
            "Each of these parts is divided into a question and a solution. Here three points are investigated: first, concerning use (uti) and enjoyment (frui); "
            "second, concerning things to be used (utibilibus) and things to be enjoyed (fruibilibus); third, concerning those who use and those who enjoy. "
            "Concerning the first, two things are asked: (1) what enjoyment (frui) is in reality; (2) what use (uti) is in reality."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 1": (
            "Objection 1: Concerning the first we proceed thus. It seems that enjoyment (frui) is an act of the intellect. "
            "For the noblest act belongs to the noblest power. Now the highest power in man is the intellect. "
            "Therefore, since enjoyment is the most perfect act of man—because it places man in his ultimate end—it seems that enjoyment is an act of the intellect."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 2": (
            "Objection 2: Furthermore, as Augustine says, vision is the whole reward (tota merces). "
            "But the reward of all merit consists in the enjoyment of the Divinity. Therefore enjoyment is essentially vision. "
            "Now vision is an act of the intellect; therefore enjoyment is as well."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 3": (
            "Objection 3: On the other hand, it seems that enjoyment is an act of the will. For an act is specified by its object. "
            "Now the object of enjoyment is the enjoyable (fruibile), which is the ultimate end. "
            "But the end, since it has the aspect of the good, is the object of the will. Therefore enjoyment is an act of the will."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 4": (
            "Objection 4: Furthermore, Augustine defines enjoyment through the will, saying: 'We enjoy things known, in which the delighted will rests for their own sake.' "
            "Therefore it seems to be an act of the will rather than of the intellect."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 5": (
            "Objection 5: Likewise, it seems that enjoyment is an act of all the powers. For the reward corresponds to merit. "
            "Now man merits through all his powers; therefore he will also be rewarded according to all of them. "
            "Since the reward is enjoyment itself, enjoyment belongs to all the powers."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 6": (
            "Objection 6: Furthermore, Augustine says that man will find pasture inwardly in the divinity of the Savior and outwardly in His humanity. "
            "Therefore it seems that both the exterior and interior powers will enjoy."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 7": (
            "Objection 7: Yet it seems that it belongs to no single power. For every act is named from the power to which it belongs, as understanding is named from the intellect. "
            "But enjoyment (frui) is not named after any power; therefore it belongs to none."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 8": (
            "Objection 8: It is further asked of which habit enjoyment is the act; and it seems to be the act of charity alone. "
            "For as is said in 1 Cor. 13, charity is a perfect virtue. Now according to the Philosopher, happiness is the operation of perfect virtue. "
            "Therefore enjoyment, in which our whole happiness consists, is the act of charity."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 9": (
            "Objection 9: This same conclusion appears from Augustine's definition cited in the text: 'To enjoy (frui) is to cleave with love to some thing for its own sake.'"
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 10": (
            "Objection 10: On the contrary, it seems not to belong to charity alone. For three things concur in enjoyment: perfect vision, full comprehension, "
            "and the adherence of consummated love. Therefore it seems also to be the act of the habits succeeding to faith and hope."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 arg. 11": (
            "Objection 11: Furthermore, through enjoyment we are joined to God. Now every virtue joins us to God, since virtue is the disposition of the perfect for the best (Physics VII). "
            "Therefore enjoyment is an act according to every virtue."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 co.": (
            "I answer that it must be said that enjoyment (fruitio) consists in the highest and best operation of man, since enjoyment "
            "is the ultimate happiness (felicitas) of man. Now happiness does not reside in habit, but in operation, according to the Philosopher (Ethics I). "
            "Moreover, the highest operation of man is the operation of his highest power, namely the intellect, regarding the noblest object, "
            "which is God: hence the very vision of the Divinity is posited as the whole substance of our beatitude (John 17:3: 'This is eternal life, that they may know Thee, the only true God'). "
            "From this vision, because the thing seen is seen not through a likeness but through its essence, it becomes in a certain way within the seer—and this is comprehension, which succeeds to hope, following upon vision, which succeeds to faith. "
            "And from the fact that the thing seen is received within the seer, it unites the seer to itself so that there arises a kind of mutual penetration through love (1 John 4:16: 'He who abides in charity abides in God, and God in him'). "
            "Upon this union with what is most fitting follows the highest delight; and in this our happiness is brought to completion, which enjoyment (fruitio) names from the side of its completion rather than its beginning, since it includes a certain delight within itself. "
            "Therefore we say that enjoyment is an act of the will, and according to the habit of charity, though in an order to the preceding powers and habits."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 ad 1": (
            "Reply to Objection 1: Appetite always follows knowledge. Hence, just as the lower part of the soul has sense and appetite (divided into irascible and concupiscible), "
            "so the supreme part has intellect and will, of which the intellect is higher in origin, and the will higher in completion and perfection. "
            "The same order holds in their habits and in their acts of vision and love; and enjoyment names the highest operation with respect to its final completion."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 ad 2": (
            "Reply to Objection 2: Similarly the reply to the second is clear: for vision does not have the complete nature of happiness except insofar as the operation is perfected by the delight that follows it—for delight perfects operation as beauty perfects youth (Ethics X)."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 ad 3": (
            "Reply to Objections 3 & 4: We grant the next two arguments, in the sense explained in the corpus."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 ad 5": (
            "Reply to Objection 5: Enjoyment properly so called cannot belong to the lower powers, because they have no operation directly concerning the ultimate end, which they cannot apprehend since they are material powers; "
            "rather, just as now the intellect is perfected by receiving from the lower powers, so in the homeland (in patria) conversely the perfection and joy of the higher part will overflow into the lower powers."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 ad 6": (
            "Reply to Objection 6: The humanity of Christ is not the ultimate end as such; hence in the vision of His humanity there is not enjoyment strictly speaking, but an accidental joy accompanying substantial beatitude."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 ad 7": (
            "Reply to Objection 7: When an act belongs to a single power absolutely, it is named from that power (as understanding from intellect); "
            "but when it is the act of one power in an order to another, it is named from neither—just as 'knowing scientifically' (scire) is an act of reason in order to intellect, and 'enjoying' (frui) is an act of the will following the act of the intellect, namely the open vision of God."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 ad 8": (
            "Reply to Objections 8 & 9: We grant these two arguments."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 ad 10": (
            "Reply to Objection 10: Although three acts concur in enjoyment, it is consummated and completed in love, as was shown in the corpus."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 1 ad 11": (
            "Reply to Objection 11: The other virtues join us to God by way of merit and disposition, whereas charity alone joins us to God by way of perfect union."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 2 arg. 1": (
            "Objection 1: Concerning the second article we proceed thus. It seems that 'to use' (uti) is an act of reason. "
            "For ordering one thing to another belongs to the comparing power, which is reason. Since 'to use' signifies ordering something to an end, it is an act of reason."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 2 arg. 2": (
            "Objection 2: Furthermore, according to the Philosopher, ordering the means to the end belongs to prudence, which is a habit of reason. "
            "Therefore 'to use,' which expresses such ordering, is an act of reason."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 2 s. c. 1": (
            "On the contrary 1: It seems to be an act of the will, because the will is placed in its definition: 'to use (uti) is to take something up into the faculty of the will.'"
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 2 s. c. 2": (
            "On the contrary 2: Furthermore, the same power is ordered to the means that attains the end. Since enjoying the end is an act of the will, so also is using the means."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 2 co.": (
            "I answer that 'to use' (uti) is spoken of in several ways. Sometimes it names any operation whatever; sometimes frequency of operation (custom); "
            "and properly here, it names the application of things ordered toward an end. Now a means is brought to its end by three operations: first, reason establishing the end and directing toward it; "
            "second, the will commanding; third, the motive power executing. 'To use' names the execution of what is ordered to the end, presupposing the ordering of reason; "
            "hence it is properly an act of the will as the universal mover of the powers in accordance with reason."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 2 ad 1": (
            "Reply to Objection 1: Using presupposes the ordering of reason, but its substance consists in the execution of the will."
        ),
        "Super Sent., lib. 1 d. 1 q. 1 a. 2 ad 2": (
            "Reply to Objection 2: Prudence perfects practical reason in accord with right appetite (Ethics VI), and thus directs both the act of reason and the regulated act of the will (such as choice and use)."
        ),
        "Super Sent., lib. 1 d. 1 q. 2 a. 1 co.": (
            "I answer that enjoying something is spoken of in three ways: (1) as the object, and in this way God alone is to be enjoyed, because the entire good of the universe is ordered to the goodness of God as the good of an army is ordered to the general (Metaphysics XII); "
            "(2) as the formal habit eliciting the act of enjoyment, and in this way created beatitude and charity are enjoyed; "
            "(3) as the instrument/faculty of enjoyment, and in this way we enjoy the power whose act is enjoyment."
        ),
        "Super Sent., lib. 1 d. 1 q. 2 a. 2 co.": (
            "I answer that we enjoy the three Divine Persons with one single enjoyment, for two reasons: first, on the part of the Divine Essence, because the object of enjoyment is supreme goodness, which is numerically one in the Father, Son, and Holy Spirit; "
            "second, on the part of the personal properties, because the three Persons are distinguished only by relations, and whoever beholds and enjoys one correlative as such beholds and enjoys the other."
        ),
        "Super Sent., lib. 1 d. 1 q. 3 a. 1 co.": (
            "I answer that whatever things are good have goodness only insofar as they approach the likeness of divine goodness. "
            "Hence every good thing that is from God is to be used (utendum) in order toward the First Goodness—either as leading to the knowledge of God or as aiding our life ordered toward God—whereas sin, which is not from God, is never to be used. "
            "Nor is it required that every single action be referred to God actually at every moment; it suffices that one habitually constitute God as the end of one's will."
        ),
        "Super Sent., lib. 1 d. 1 q. 4 a. 1 co.": (
            "I answer that enjoyment implies delight in the ultimate end. Since delight requires knowledge, insensible creatures do not enjoy; "
            "and since brute animals do not apprehend the ultimate end as such, they do not enjoy properly. The sinner, placing his ultimate end where it is not, does not truly enjoy; "
            "the righteous man in this life (in via) enjoys imperfectly in hope; while the blessed in heaven (in patria), who have attained the ultimate end, enjoy truly, properly, and perfectly."
        ),
        "Super Sent., lib. 1 d. 1 q. 4 a. 2 co.": (
            "I answer that use (usus) concerns things ordered to the end. Those things that include and touch the end without imperfection—such as natural perfections and the seven gifts of the Holy Spirit—will remain in use in heaven (in patria); "
            "whereas things that imply distance from the end, such as faith, hope, penance, and bodily food, will cease."
        ),
        "Super Sent., pr.": (
            '"I, Wisdom, have poured out rivers: I, like a brook of boundless water, flow down: I, like the river Dorix, '
            'and like an aqueduct, came forth from Paradise. I said: I will water my garden of plantings, and I will abundantly '
            'water the fruit of my meadow" (Ecclesiasticus 24:40–42). Among the many teachings that have proceeded from various '
            'thinkers concerning wisdom—namely, what true wisdom might be—the Apostle set forth one that is singularly firm and true, '
            'saying that Christ is the power of God and the wisdom of God (1 Cor. 1:24), who has also been made wisdom for us from God '
            '(1 Cor. 1:30). Now this is not said as though the Son alone were wisdom, since the Father, the Son, and the Holy Spirit '
            'are one wisdom just as they are one essence; rather, wisdom is appropriated in a special way to the Son, because the works '
            'of wisdom seem in many respects to correspond to the proper attributes of the Son. For through the wisdom of God the hidden '
            'things of God are manifested, the works of creatures are brought forth, and not only brought forth, but also restored and '
            'perfected with that perfection whereby each thing is called perfect insofar as it attains its proper end.'
        ),
    }

    # 1. Load all 614 Question Prologues (I q. N pr., etc.) from questions.json
    try:
        q_raw = download_cached(
            "https://raw.githubusercontent.com/pantaleonfassbender-coder/Aquinas-summa/main/data/questions.json",
            "summa_questions.json",
        )
        q_items = json.loads(q_raw.decode("utf-8", errors="ignore"))
        for q_obj in q_items:
            p = q_obj.get("part", "")
            ct_part = "Suppl." if p == "Suppl" else p
            n = q_obj.get("n")
            pro = (q_obj.get("pro") or "").strip()
            title = (q_obj.get("t") or "").strip()
            if ct_part and n and pro:
                full_pro = f"[{title}] {pro}" if title else pro
                sections[f"{ct_part} q. {n} pr."] = full_pro
    except Exception as exc:
        print(f"[build-data] Warning loading summa_questions.json: {exc}")

    # 2. Load all 3,125 Articles (arg, s. c., co., ad)
    for p in parts:
        raw = download_cached(
            f"https://raw.githubusercontent.com/pantaleonfassbender-coder/Aquinas-summa/main/data/text/{p}.json",
            f"summa_{p}.json",
        )
        data = json.loads(raw.decode("utf-8", errors="ignore"))
        ct_part = "Suppl." if p == "Suppl" else p
        for art in data.get("articles", []):
            q = art.get("q")
            a = art.get("a")
            prefix = f"{ct_part} q. {q} a. {a}"
            if art.get("t"):
                sections[f"{prefix} title"] = art["t"].strip()
            if art.get("sc"):
                sections[f"{prefix} s. c."] = art["sc"].strip()
            if art.get("co"):
                sections[f"{prefix} co."] = art["co"].strip()
            for ob in art.get("ob", []):
                n = ob.get("n")
                if n and ob.get("t"):
                    sections[f"{prefix} arg. {n}"] = ob["t"].strip()
            for ad in art.get("rp", []):
                n = ad.get("n")
                if n and ad.get("t"):
                    sections[f"{prefix} ad {n}"] = ad["t"].strip()
                    if len(art.get("rp", [])) == 1:
                        sections[f"{prefix} ad arg."] = ad["t"].strip()
                        sections[f"{prefix} ad"] = ad["t"].strip()

    # 3. Also extract bilingual Latin-English paragraph pairs from Geremia/AquinasOperaOmnia
    incipits: dict[str, str] = {}
    bilingual_files = [
        "ContraGentiles1.htm",
        "ContraGentiles2.htm",
        "ContraGentiles3a.htm",
        "ContraGentiles3b.htm",
        "ContraGentiles4.htm",
        "Compendium.htm",
        "DeEnte%26Essentia.htm",
        "DePrincNaturae.htm",
        "Principium.htm",
        "Creed.htm",
        "PaterNoster.htm",
        "AveMaria.htm",
        "Sent1d3q1a1.htm",
        "Sent1d8q4a1.htm",
        "Sent2d43q1proemium.htm",
        "Sent2d43q1a1.htm",
        "Sent2d43q1a2.htm",
        "Sent2d43q1a3.htm",
        "Sent2d43q1a4.htm",
        "Sent2d43q1a5.htm",
        "Sent2d43q1a6.htm",
        "Sent2d44ExpTextus.htm",
        "Sent2d44q2a2.htm",
        "Sent4d8q1a1.htm",
        "Sent4d8q1a2.htm",
        "Sent4d8q1a3.htm",
        "Sent4d8q1a4.htm",
        "Sent4d15q3a1.htm",
        "Sent4d15q3a2.htm",
        "Sent4d15q3a3.htm",
        "Sent4d15q3a4.htm",
        "Sent4d49q2a1.htm",
    ]
    tr_re = re.compile(r"<tr[^>]*>\s*<td[^>]*>(.*?)<td[^>]*>(.*?)(?=<tr|</tbody|</table|\Z)", re.DOTALL | re.IGNORECASE)

    def register_incipit(lat_str: str, eng_str: str) -> None:
        lat_clean = re.sub(r"^(?:\[\d+\]|\d+\.|Prooemium|Caput\s+\d+|Pars\s+\d+)\s*", "", lat_str, flags=re.IGNORECASE).strip()
        eng_clean = re.sub(r"^\[\d+\]\s*", "", eng_str).strip()
        words = [re.sub(r"[^a-z]", "", w.lower().replace("j", "i").replace("v", "u")) for w in lat_clean.split()[:6]]
        words = [w for w in words if w]
        if len(words) >= 4 and len(eng_clean) >= 15:
            incipits[" ".join(words[:5])] = eng_clean
            incipits[" ".join(words[:4])] = eng_clean

    for bf in bilingual_files:
        try:
            b_raw = download_cached(
                f"https://raw.githubusercontent.com/Geremia/AquinasOperaOmnia/master/{bf}",
                f"bilingual_{bf.replace('%26', '_')}",
            ).decode("utf-8", errors="ignore")
            for m in tr_re.finditer(b_raw):
                lat_td = m.group(1)
                eng_td = m.group(2)
                register_incipit(strip_tags(lat_td), strip_tags(eng_td))
                lat_parts = [strip_tags(p) for p in re.split(r"<br\s*/?>", lat_td, flags=re.IGNORECASE) if strip_tags(p)]
                eng_parts = [strip_tags(p) for p in re.split(r"<br\s*/?>", eng_td, flags=re.IGNORECASE) if strip_tags(p)]
                if len(lat_parts) == len(eng_parts) and len(lat_parts) > 1:
                    for lp, ep in zip(lat_parts, eng_parts):
                        register_incipit(lp, ep)
        except Exception as exc:
            print(f"[build-data] Warning loading {bf}: {exc}")

    # 4. Parse Sentences.htm (Prologue of Thomas Aquinas snp0000.html + Prologue Q. 1 Articles 1-5 snp0001.html)
    try:
        sent_htm = download_cached(
            "https://raw.githubusercontent.com/Geremia/AquinasOperaOmnia/master/Sentences.htm",
            "Sentences.htm",
        ).decode("utf-8", errors="ignore")
        anchors = re.split(r'<a\s+name="([^"]+)"[^>]*>', sent_htm)
        sec_map: dict[str, list[str]] = {}
        for idx_a in range(1, len(anchors), 2):
            a_name = anchors[idx_a]
            a_body = anchors[idx_a + 1]
            p_list = [
                strip_tags(p)
                for p in re.findall(r"<p[^>]*>(.*?)(?=<p|<hr|</dl|\Z)", a_body, re.DOTALL | re.IGNORECASE)
            ]
            p_list = [
                p for p in p_list if p and not p.startswith(("PROLOGUE", "QUESTION", "Article", "COMMENTARY"))
            ]
            sec_map[a_name] = p_list

        if "01" in sec_map and sec_map["01"]:
            sections["Super Sent., pr."] = "\n\n".join(sec_map["01"])
        if "03" in sec_map and sec_map["03"]:
            sections["Super Sent., q. 1 pr."] = " ".join(sec_map["03"])
            sections["Super Sent., q. 1 a. 5 expos."] = " ".join(sec_map["03"][:-1])
        if "1" in sec_map and len(sec_map["1"]) >= 15:
            p1 = sec_map["1"]
            sections["Super Sent., q. 1 a. 1 arg. 1"] = f"{p1[1]} {p1[2]}"
            sections["Super Sent., q. 1 a. 1 arg. 2"] = p1[3]
            sections["Super Sent., q. 1 a. 1 arg. 3"] = f"{p1[4]} {p1[5]}"
            sections["Super Sent., q. 1 a. 1 s. c. 1"] = p1[7]
            sections["Super Sent., q. 1 a. 1 s. c. 2"] = p1[8]
            sections["Super Sent., q. 1 a. 1 co."] = f"{p1[10]} {p1[11]}"
            sections["Super Sent., q. 1 a. 1 ad 1"] = p1[12]
            sections["Super Sent., q. 1 a. 1 ad 2"] = p1[13]
            sections["Super Sent., q. 1 a. 1 ad 3"] = p1[14]
        if "2" in sec_map and len(sec_map["2"]) >= 14:
            p2 = sec_map["2"]
            sections["Super Sent., q. 1 a. 2 arg. 1"] = f"{p2[1]} {p2[2]}"
            sections["Super Sent., q. 1 a. 2 arg. 2"] = p2[3]
            sections["Super Sent., q. 1 a. 2 arg. 3"] = p2[4]
            sections["Super Sent., q. 1 a. 2 s. c. 1"] = p2[6]
            sections["Super Sent., q. 1 a. 2 s. c. 2"] = p2[7]
            sections["Super Sent., q. 1 a. 2 co."] = p2[9]
            sections["Super Sent., q. 1 a. 2 ad 1"] = p2[10]
            sections["Super Sent., q. 1 a. 2 ad 2"] = p2[11]
            sections["Super Sent., q. 1 a. 2 ad 3"] = f"{p2[12]} {p2[13]}"
        if "3" in sec_map and len(sec_map["3"]) >= 29:
            p3 = sec_map["3"]
            sections["Super Sent., q. 1 a. 3 qc. 1 arg. 1"] = f"{p3[1]} {p3[2]}"
            sections["Super Sent., q. 1 a. 3 qc. 1 s. c. 1"] = p3[4]
            sections["Super Sent., q. 1 a. 3 qc. 1 s. c. 2"] = p3[5]
            sections["Super Sent., q. 1 a. 3 qc. 2 arg. 1"] = f"{p3[7]} {p3[8]}"
            sections["Super Sent., q. 1 a. 3 qc. 2 arg. 2"] = p3[9]
            sections["Super Sent., q. 1 a. 3 qc. 2 arg. 3"] = p3[10]
            sections["Super Sent., q. 1 a. 3 qc. 2 s. c. 1"] = p3[12]
            sections["Super Sent., q. 1 a. 3 qc. 3 arg. 1"] = p3[14]
            sections["Super Sent., q. 1 a. 3 qc. 3 s. c. 1"] = p3[16]
            sections["Super Sent., q. 1 a. 3 qc. 1 co."] = f"{p3[18]} {p3[19]}"
            sections["Super Sent., q. 1 a. 3 qc. 1 ad 1"] = p3[20]
            sections["Super Sent., q. 1 a. 3 qc. 1 ad s. c."] = p3[21]
            if "To the objection about particulars" in p3[23]:
                qc2_co, qc2_ad1 = p3[23].split("To the objection about particulars", 1)
                sections["Super Sent., q. 1 a. 3 qc. 2 co."] = qc2_co.strip()
                sections["Super Sent., q. 1 a. 3 qc. 2 ad 1"] = "To the objection about particulars" + qc2_ad1
            else:
                sections["Super Sent., q. 1 a. 3 qc. 2 co."] = p3[23]
                sections["Super Sent., q. 1 a. 3 qc. 2 ad 1"] = p3[24]
            sections["Super Sent., q. 1 a. 3 qc. 2 ad 2"] = p3[24]
            sections["Super Sent., q. 1 a. 3 qc. 2 ad 3"] = p3[25]
            sections["Super Sent., q. 1 a. 3 qc. 2 ad s. c."] = p3[26]
            if "To the objection that no one is most certain" in p3[28]:
                qc3_co, qc3_ad1 = p3[28].split("To the objection that no one is most certain", 1)
                sections["Super Sent., q. 1 a. 3 qc. 3 co."] = qc3_co.strip()
                sections["Super Sent., q. 1 a. 3 qc. 3 ad 1"] = (
                    "To the objection that no one is most certain" + qc3_ad1
                )
            else:
                sections["Super Sent., q. 1 a. 3 qc. 3 co."] = p3[28]
                sections["Super Sent., q. 1 a. 3 qc. 3 ad 1"] = p3[28]
        if "4" in sec_map and len(sec_map["4"]) >= 17:
            p4 = sec_map["4"]
            sections["Super Sent., q. 1 a. 4 arg. 1"] = f"{p4[1]} {p4[2]} {p4[3]}"
            sections["Super Sent., q. 1 a. 4 arg. 2"] = f"{p4[4]} {p4[5]}"
            sections["Super Sent., q. 1 a. 4 arg. 3"] = f"{p4[6]} {p4[7]}"
            sections["Super Sent., q. 1 a. 4 co."] = " ".join(p4[9:14])
            sections["Super Sent., q. 1 a. 4 ad 1"] = p4[14]
            sections["Super Sent., q. 1 a. 4 ad 2"] = p4[15]
            sections["Super Sent., q. 1 a. 4 ad 3"] = p4[16]
        if "5" in sec_map and len(sec_map["5"]) >= 17:
            p5 = sec_map["5"]
            sections["Super Sent., q. 1 a. 5 arg. 1"] = f"{p5[1]} {p5[2]}"
            sections["Super Sent., q. 1 a. 5 arg. 2"] = p5[3]
            sections["Super Sent., q. 1 a. 5 arg. 3"] = p5[4]
            sections["Super Sent., q. 1 a. 5 arg. 4"] = p5[5]
            sections["Super Sent., q. 1 a. 5 s. c. 1"] = p5[7]
            sections["Super Sent., q. 1 a. 5 s. c. 2"] = p5[8]
            sections["Super Sent., q. 1 a. 5 co."] = " ".join(p5[10:13])
            sections["Super Sent., q. 1 a. 5 ad 1"] = p5[13]
            sections["Super Sent., q. 1 a. 5 ad 2"] = p5[14]
            sections["Super Sent., q. 1 a. 5 ad 3"] = p5[15]
            sections["Super Sent., q. 1 a. 5 ad 4"] = p5[16]
    except Exception as exc:
        print(f"[build-data] Warning parsing Sentences.htm: {exc}")

    # 5. Align the 276 bilingual HTML works from isidore.co/aquinas (Geremia/AquinasOperaOmnia)
    #    plus the 289,470 parallel segments from Geremia23/AquinasLatinEnglish across ALL archive/*.html works
    try:
        src_enc_path = CACHE_DIR / "train.src.encoded"
        trg_enc_path = CACHE_DIR / "train.trg.encoded"
        if not src_enc_path.exists():
            download_cached(
                "https://huggingface.co/datasets/Geremia23/AquinasLatinEnglish/resolve/main/ittb_la_en/train.src.encoded",
                "train.src.encoded",
            )
        if not trg_enc_path.exists():
            download_cached(
                "https://huggingface.co/datasets/Geremia23/AquinasLatinEnglish/resolve/main/ittb_la_en/train.trg.encoded",
                "train.trg.encoded",
            )

        boilerplate_re = re.compile(
            r"^(?:[\d\s.,:;()-]+|(?:\([a-z0-9]+\)\s*)+|"
            r"(?:prooemium|proeomium|prologus|caput|capitulum|articulus|quaestio|lectio|distinctio|liber|obiectio|argumentum|responsio|conclusio|solutio)(?:\s+(?:\d+|[ivxlcdm]+))?\b[.,:;)]*\s*|"
            r"(?:ad|circa)\s+\w+\s+sic\s+proceditur\s*\.?\s*|"
            r"ulterius\s*(?:quaeritur)?\s*\.?\s*|"
            r"videtur\s+(?:autem\s+)?quod\s+|"
            r"praeterea\s*,?\s*|"
            r"item\s*,?\s*|"
            r"sed\s+contra\s*(?:est\s+quod)?\s*,?\s*|"
            r"contra\s*,?\s*|"
            r"respondeo\s*(?:dicendum)?\s*(?:quod)?\s*,?\s*|"
            r"ad\s+\w+\s+(?:ergo\s+)?dicendum\s*(?:quod)?\s*,?\s*)+",
            re.IGNORECASE,
        )

        def detok_bpe(s: str) -> str:
            s = s.replace("@@ ", "").replace("@@", "")
            s = re.sub(r"\s+([,.;:?!\)\]\}])", r"\1", s)
            s = re.sub(r"([\(\[\{])\s+", r"\1", s)
            return s.strip()

        def norm_tokens(s: str) -> list[str]:
            s = s.replace("@@ ", "").replace("@@", "")
            s = strip_tags(s)
            s = re.sub(r"^\s*\[\d+\][^.]*\.\s*", "", s)
            s = boilerplate_re.sub("", s.strip())
            w = [re.sub(r"[^a-z]", "", tok.lower().replace("j", "i").replace("v", "u")) for tok in s.split()]
            return [x for x in w if len(x) >= 2]

        all_src_toks: list[list[str]] = []
        all_trg_texts: list[str] = []

        cache_htm_dir = CACHE_DIR / "isidore_htm"
        if cache_htm_dir.exists():
            for htm_path in sorted(cache_htm_dir.glob("*")):
                raw_htm = htm_path.read_bytes().decode("utf-8", errors="ignore")
                for tr in re.split(r"<tr\b[^>]*>", raw_htm, flags=re.I)[1:]:
                    tr_clean = re.split(r"</table|</tbody", tr, maxsplit=1, flags=re.I)[0]
                    tds = re.split(r"<td\b[^>]*>", tr_clean, flags=re.I)[1:]
                    if len(tds) >= 2:
                        la_col = tds[-2] if (len(tds) >= 3 and len(norm_tokens(tds[0])) == 0) else tds[0]
                        en_col = tds[-1] if (len(tds) >= 3 and len(norm_tokens(tds[0])) == 0) else tds[1]
                        if "<br" in la_col.lower() and "<br" in en_col.lower():
                            la_parts = [strip_tags(p) for p in re.split(r"<br\s*/?>", la_col, flags=re.I)]
                            en_parts = [strip_tags(p) for p in re.split(r"<br\s*/?>", en_col, flags=re.I)]
                            la_parts = [p for p in la_parts if p]
                            en_parts = [p for p in en_parts if p]
                            if len(la_parts) == len(en_parts) and len(la_parts) >= 2:
                                for lp, ep in zip(la_parts, en_parts):
                                    lt = norm_tokens(lp)
                                    if len(lt) >= 2 and ep:
                                        all_src_toks.append(lt)
                                        all_trg_texts.append(ep)
                        la_txt = strip_tags(la_col)
                        en_txt = strip_tags(en_col)
                        if la_txt and en_txt:
                            toks = norm_tokens(la_txt)
                            if len(toks) >= 2:
                                all_src_toks.append(toks)
                                all_trg_texts.append(en_txt)

        src_lines = src_enc_path.read_text(encoding="utf-8", errors="ignore").splitlines()
        trg_lines = trg_enc_path.read_text(encoding="utf-8", errors="ignore").splitlines()
        for s_l, t_l in zip(src_lines, trg_lines):
            toks = norm_tokens(s_l)
            if t_l.strip() and len(toks) >= 2:
                all_src_toks.append(toks)
                all_trg_texts.append(detok_bpe(t_l))

        by_ck5: dict[str, list[int]] = {}
        by_ck4: dict[str, list[int]] = {}
        by_ck3: dict[str, list[int]] = {}
        for idx_line, toks in enumerate(all_src_toks):
            if len(toks) >= 5:
                by_ck5.setdefault(" ".join(toks[:5]), []).append(idx_line)
            if len(toks) >= 4:
                by_ck4.setdefault(" ".join(toks[:4]), []).append(idx_line)
            if len(toks) >= 3:
                by_ck3.setdefault(" ".join(toks[:3]), []).append(idx_line)

        p_tag_re = re.compile(r'<P\s+TITLE="([^"]+)">(.*?)</P>', re.DOTALL | re.IGNORECASE)
        ref_span_re = re.compile(r'<SPAN\s+CLASS="(?:ref|tit)">.*?</SPAN>', re.DOTALL | re.IGNORECASE)

        for fpath in sorted(ARCHIVE_DIR.glob("*.html")):
            if fpath.name in ("demo-reader.html",) or fpath.name.startswith("sth"):
                continue
            raw_html = fpath.read_bytes().decode("iso-8859-1", errors="ignore")
            for m_p in p_tag_re.finditer(raw_html):
                p_title = m_p.group(1).replace("ª", "").replace("º", "").strip()
                if p_title in sections:
                    continue
                p_body = ref_span_re.sub("", m_p.group(2))
                p_toks = norm_tokens(p_body)
                if len(p_toks) < 3:
                    continue

                cand_list: list[int] = []
                seen_c: set[int] = set()
                max_off = min(25, max(1, len(p_toks) - 2))
                for off in range(0, max_off):
                    sub = p_toks[off:]
                    hits: list[int] = []
                    if len(sub) >= 5:
                        hits = by_ck5.get(" ".join(sub[:5]), [])
                    if not hits and len(sub) >= 4:
                        hits = by_ck4.get(" ".join(sub[:4]), [])
                    if not hits and off == 0 and len(sub) >= 3:
                        hits = by_ck3.get(" ".join(sub[:3]), [])
                    for h in hits:
                        if h not in seen_c:
                            seen_c.add(h)
                            cand_list.append(h)
                    if len(cand_list) >= 45:
                        break
                if not cand_list:
                    continue

                p_set = {w for w in p_toks if len(w) >= 4} or set(p_toks)
                p_str = " ".join(p_toks)
                max_look = 300 if len(p_toks) > 300 else 120
                for c_idx in cand_list[:60]:
                    combined_src_toks = list(all_src_toks[c_idx])
                    collected_trg = [all_trg_texts[c_idx]]
                    skips = 0
                    for j in range(c_idx + 1, min(len(all_src_toks), c_idx + max_look)):
                        if len(combined_src_toks) >= len(p_toks) * 1.08:
                            break
                        sub_toks = all_src_toks[j]
                        if not sub_toks:
                            continue
                        sub_set = {w for w in sub_toks if len(w) >= 4} or set(sub_toks)
                        if (" ".join(sub_toks[:min(4, len(sub_toks))]) in p_str) or (
                            len(sub_set & p_set) / len(sub_set) >= 0.60
                        ):
                            combined_src_toks.extend(sub_toks)
                            collected_trg.append(all_trg_texts[j])
                            skips = 0
                        elif skips < 6 and len(sub_toks) < 30:
                            skips += 1
                        else:
                            break
                    src_set = {w for w in combined_src_toks if len(w) >= 4} or set(combined_src_toks)
                    if not p_set or not src_set:
                        continue
                    overlap = len(p_set & src_set) / len(p_set)
                    reverse_overlap = len(p_set & src_set) / len(src_set)
                    if overlap >= 0.70 and reverse_overlap >= 0.65:
                        sections[p_title] = " ".join(collected_trg)
                        break
    except Exception as exc:
        print(f"[build-data] Warning aligning parallel corpus: {exc}")

    return {"sections": sections}


def main() -> int:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print("[build-data] 1/6 Building Whitaker's Words dictionary & inflections...")
    w_dict, w_inflects = build_whitaker()
    (DATA_DIR / "whitaker-dict.json").write_text(json.dumps(w_dict, ensure_ascii=False), encoding="utf-8")
    (DATA_DIR / "whitaker-inflects.json").write_text(json.dumps(w_inflects, ensure_ascii=False), encoding="utf-8")
    print(f"  -> {len(w_dict['entries'])} Whitaker entries, {len(w_inflects['rules'])} inflection rules")

    print("[build-data] 2/6 Building Thomistic Lexicon (from Thomas-Lexikon + Curated Scholastic Layer)...")
    t_lex = build_thomistic_lexicon(w_dict["entries"])
    (DATA_DIR / "thomistic-lexicon.json").write_text(json.dumps(t_lex, ensure_ascii=False), encoding="utf-8")
    print(f"  -> {len(t_lex['entries'])} Thomistic Lexicon entries")

    print("[build-data] 3/6 Building Ecclesiastical Latin Dictionary...")
    ecc_dict = build_ecclesiastical_dictionary(w_dict["entries"], t_lex["entries"])
    (DATA_DIR / "ecclesiastical-dict.json").write_text(json.dumps(ecc_dict, ensure_ascii=False), encoding="utf-8")
    print(f"  -> {len(ecc_dict['entries'])} Ecclesiastical Latin Dictionary entries")

    print("[build-data] 4/6 Building Wiktionary (Latin-English & Victionarium) Dictionary...")
    wik_dict = build_wiktionary_dictionary(w_dict["entries"], t_lex["entries"])
    (DATA_DIR / "wiktionary-latin.json").write_text(json.dumps(wik_dict, ensure_ascii=False), encoding="utf-8")
    print(f"  -> {len(wik_dict['entries'])} Wiktionary Latin entries")

    print("[build-data] 5/6 Building Expanded Lewis & Short Dictionary...")
    ls_dict = build_lewis_short(w_dict["entries"], t_lex["entries"])
    (DATA_DIR / "lewis-short-core.json").write_text(json.dumps(ls_dict, ensure_ascii=False), encoding="utf-8")
    print(f"  -> {len(ls_dict['entries'])} Lewis & Short entries")

    print("[build-data] 6/6 Building Summa Theologiae parallel English reference index...")
    summa_en = build_summa_english()
    (DATA_DIR / "summa-english.json").write_text(json.dumps(summa_en, ensure_ascii=False), encoding="utf-8")
    print(f"  -> {len(summa_en['sections'])} Summa Theologiae English sections")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
