/**
 * Author names that fit a market. A French page signed "Ethan Walker" reads as translated or outsourced,
 * which costs trust. These lists are used to spot obviously foreign author names and to suggest local ones.
 */

/** Common local first names (mixed genders) per language, used for suggestions and to avoid false alarms. */
export const LOCAL_FIRST_NAMES: Record<string, string[]> = {
  fr: ['Camille', 'Julien', 'Claire', 'Thomas', 'Léa', 'Nicolas', 'Manon', 'Antoine', 'Chloé', 'Mathieu', 'Élodie', 'Pierre', 'Sophie', 'Hugo', 'Margaux', 'Louis', 'Inès', 'Lucas', 'Juliette', 'Maxime'],
  nl: ['Sanne', 'Daan', 'Lotte', 'Bram', 'Femke', 'Jeroen', 'Anouk', 'Thijs', 'Eva', 'Ruben', 'Lieke', 'Joost', 'Marieke', 'Sem', 'Iris', 'Pieter'],
  sv: ['Erik', 'Anna', 'Johan', 'Elin', 'Lars', 'Sara', 'Oskar', 'Maja', 'Karl', 'Ebba', 'Gustav', 'Linnea', 'Nils', 'Frida', 'Axel', 'Ida'],
  da: ['Mads', 'Sofie', 'Rasmus', 'Mette', 'Frederik', 'Line', 'Kasper', 'Camilla', 'Mikkel', 'Freja', 'Søren', 'Ida', 'Anders', 'Signe', 'Jonas', 'Louise'],
  nb: ['Ola', 'Ingrid', 'Henrik', 'Kari', 'Sindre', 'Nora', 'Magnus', 'Hanne', 'Eirik', 'Silje', 'Jonas', 'Tuva'],
  no: ['Ola', 'Ingrid', 'Henrik', 'Kari', 'Sindre', 'Nora', 'Magnus', 'Hanne', 'Eirik', 'Silje', 'Jonas', 'Tuva'],
  fi: ['Mikko', 'Aino', 'Juha', 'Laura', 'Antti', 'Emilia', 'Ville', 'Sanna', 'Janne', 'Elina', 'Teemu', 'Noora'],
  de: ['Lukas', 'Anna', 'Jonas', 'Laura', 'Felix', 'Julia', 'Maximilian', 'Lena', 'Tobias', 'Sarah', 'Florian', 'Katharina', 'Stefan', 'Johanna'],
  pt: ['João', 'Inês', 'Tiago', 'Beatriz', 'Rui', 'Mariana', 'Pedro', 'Catarina', 'Miguel', 'Sofia', 'Diogo', 'Ana', 'Gonçalo', 'Rita'],
  es: ['Javier', 'Lucía', 'Pablo', 'María', 'Álvaro', 'Carmen', 'Sergio', 'Laura', 'Diego', 'Elena', 'Alejandro', 'Paula'],
  it: ['Luca', 'Giulia', 'Marco', 'Chiara', 'Alessandro', 'Francesca', 'Matteo', 'Sara', 'Davide', 'Martina', 'Andrea', 'Elena'],
  pl: ['Piotr', 'Anna', 'Tomasz', 'Katarzyna', 'Michał', 'Agnieszka', 'Paweł', 'Magdalena', 'Krzysztof', 'Joanna'],
  cs: ['Jan', 'Tereza', 'Petr', 'Lucie', 'Tomáš', 'Kateřina', 'Martin', 'Veronika', 'Jakub', 'Eva'],
  sk: ['Peter', 'Zuzana', 'Martin', 'Katarína', 'Tomáš', 'Lucia', 'Michal', 'Jana'],
  hu: ['Bence', 'Anna', 'Máté', 'Eszter', 'Gábor', 'Réka', 'Dávid', 'Zsófia'],
  ro: ['Andrei', 'Ioana', 'Mihai', 'Elena', 'Alexandru', 'Ana', 'Ștefan', 'Maria'],
  sr: ['Nikola', 'Jelena', 'Marko', 'Milica', 'Stefan', 'Ana', 'Luka', 'Jovana', 'Nemanja', 'Teodora'],
  hr: ['Ivan', 'Ana', 'Luka', 'Petra', 'Marko', 'Ivana', 'Josip', 'Marija'],
  sl: ['Luka', 'Nina', 'Jan', 'Eva', 'Matej', 'Maja'],
  bg: ['Georgi', 'Maria', 'Ivan', 'Elena', 'Dimitar', 'Desislava'],
  el: ['Giorgos', 'Maria', 'Nikos', 'Eleni', 'Kostas', 'Katerina', 'Dimitris', 'Sofia'],
  tr: ['Mehmet', 'Elif', 'Emre', 'Zeynep', 'Burak', 'Ayşe', 'Can', 'Selin'],
  th: ['Somchai', 'Siriporn', 'Anan', 'Kanya', 'Nattapong', 'Pimchanok', 'Thanawat', 'Supattra'],
  ja: ['Haruto', 'Yui', 'Ren', 'Sakura', 'Sota', 'Aoi'],
  en: ['James', 'Emily', 'Oliver', 'Sophie', 'Jack', 'Charlotte', 'Thomas', 'Lucy', 'Harry', 'Olivia', 'Liam', 'Grace'],
};

/** Typical local surnames, paired with first names for suggestions. */
const LOCAL_SURNAMES: Record<string, string[]> = {
  fr: ['Martin', 'Bernard', 'Dubois', 'Lefèvre', 'Moreau', 'Laurent', 'Girard', 'Fontaine'],
  nl: ['de Vries', 'Jansen', 'Bakker', 'Visser', 'Smit', 'van Dijk'],
  sv: ['Andersson', 'Lindqvist', 'Johansson', 'Nilsson', 'Berg', 'Eriksson'],
  da: ['Nielsen', 'Jensen', 'Hansen', 'Pedersen', 'Larsen', 'Christensen'],
  nb: ['Hansen', 'Johansen', 'Olsen', 'Berg', 'Haugen'],
  no: ['Hansen', 'Johansen', 'Olsen', 'Berg', 'Haugen'],
  fi: ['Korhonen', 'Virtanen', 'Mäkinen', 'Nieminen'],
  de: ['Müller', 'Schneider', 'Fischer', 'Weber', 'Wagner', 'Becker'],
  pt: ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Costa', 'Oliveira'],
  es: ['García', 'Martínez', 'López', 'Sánchez', 'Romero', 'Navarro'],
  it: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano'],
  pl: ['Nowak', 'Kowalski', 'Wiśniewska', 'Wójcik', 'Kamiński'],
  cs: ['Novák', 'Svobodová', 'Dvořák', 'Černá'],
  sk: ['Horváth', 'Kováčová', 'Varga', 'Tóth'],
  hu: ['Nagy', 'Kovács', 'Tóth', 'Szabó'],
  ro: ['Popescu', 'Ionescu', 'Dumitru', 'Stan'],
  sr: ['Jovanović', 'Petrović', 'Nikolić', 'Marković', 'Đorđević'],
  hr: ['Horvat', 'Kovačević', 'Babić', 'Marić'],
  sl: ['Novak', 'Horvat', 'Kranjc'],
  bg: ['Ivanov', 'Petrova', 'Georgiev', 'Dimitrova'],
  el: ['Papadopoulos', 'Nikolaou', 'Georgiou', 'Oikonomou'],
  tr: ['Yılmaz', 'Kaya', 'Demir', 'Şahin'],
  th: ['Srisuk', 'Wongsa', 'Chaiyaporn', 'Rattanakul'],
  ja: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka'],
  en: ['Walker', 'Taylor', 'Hughes', 'Clarke', 'Bennett', 'Murphy'],
};

/** First names that read as English-speaking on a non-English page. */
const ENGLISH_FIRST_NAMES = new Set(
  (
    'aaron adam alex alexander alice amanda amber amy andrew angela anthony ashley austin barbara ben benjamin beth brandon brian brittany ' +
    'brooke bruce caleb cameron carl carol charles charlie chloe chris christopher cody connor craig dan daniel david debbie dennis derek ' +
    'dylan edward eliza elizabeth ella emily emma eric ethan evan gary george grace greg gregory hannah harry heather henry ian isaac jack ' +
    'jacob jake james jamie jason jeff jeffrey jennifer jeremy jessica jim joe john johnny jonathan jordan josh joshua justin karen kate ' +
    'katherine kayla keith kelly kevin kyle larry lauren liam lily logan madison mark mason matt matthew megan melissa michael mike molly ' +
    'nathan noah oliver olivia owen patrick paul peter rachel rebecca richard rob robert ryan sam samantha sarah scott sean sophia ' +
    'stephanie steve steven taylor timothy tom tyler william zachary'
  ).split(' '),
);

/** Surnames that read as English-speaking. */
const ENGLISH_SURNAMES = new Set(
  (
    'smith johnson williams brown jones miller davis wilson anderson taylor thomas moore jackson white harris clark lewis robinson walker ' +
    'young allen wright scott green baker adams hill campbell mitchell roberts carter phillips evans turner parker collins edwards stewart ' +
    'morris murphy cook rogers morgan cooper peterson reed bailey bell kelly howard ward cox richardson wood watson brooks bennett gray ' +
    'hughes price sanders myers foster powell jenkins perry russell sullivan fisher hayes wallace cole west jordan graham hamilton ' +
    'mcdonald thompson'
  ).split(' '),
);

const SLAVIC_LANGS = new Set(['ru', 'uk', 'be', 'pl', 'cs', 'sk', 'sl', 'hr', 'sr', 'bs', 'mk', 'bg']);
const SLAVIC_SURNAME_RE = /(ova|ovа|eva|ova|ina|ovich|ovic|evich|enko|chuk|yuk|ski|sky|skaya|skiy|ov|ev)$/i;

export type AuthorFit = { fits: boolean; reason?: string; suggestions: string[] };

function strip(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Does this author name fit a page written in `lang`? Only clear cases are flagged:
 * an English first name or surname on a non-English page, or a Slavic surname on a non-Slavic page.
 */
export function authorNameFit(name: string, lang: string): AuthorFit {
  const suggestions = suggestLocalNames(lang, 3);
  const parts = name.replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || lang === 'en') return { fits: true, suggestions };
  const first = strip(parts[0]!);
  const last = strip(parts[parts.length - 1]!);
  const local = new Set((LOCAL_FIRST_NAMES[lang] ?? []).map(strip));
  if (local.has(first)) return { fits: true, suggestions };
  // Thai, Japanese, Greek… pages signed with a Latin-script name.
  if (/^(th|ja|zh|ko|el|ru|uk|bg|sr|ar|he|fa|hi)$/.test(lang) && /^[a-z'-]+$/.test(first) && ENGLISH_FIRST_NAMES.has(first)) {
    return { fits: false, reason: `"${parts[0]}" is an English first name on a ${lang.toUpperCase()} page`, suggestions };
  }
  if (ENGLISH_FIRST_NAMES.has(first)) return { fits: false, reason: `"${parts[0]}" is an English first name`, suggestions };
  if (parts.length > 1 && ENGLISH_SURNAMES.has(last)) return { fits: false, reason: `"${parts[parts.length - 1]}" is an English surname`, suggestions };
  if (parts.length > 1 && !SLAVIC_LANGS.has(lang) && SLAVIC_SURNAME_RE.test(last) && last.length > 5) {
    return { fits: false, reason: `"${parts[parts.length - 1]}" reads as an Eastern European surname`, suggestions };
  }
  return { fits: true, suggestions };
}

/** A few plausible local author names for a language (deterministic, for suggestions). */
export function suggestLocalNames(lang: string, n = 3): string[] {
  const firsts = LOCAL_FIRST_NAMES[lang];
  const lasts = LOCAL_SURNAMES[lang];
  if (!firsts || !lasts) return [];
  return Array.from({ length: n }, (_, i) => `${firsts[(i * 3) % firsts.length]} ${lasts[(i * 2 + 1) % lasts.length]}`);
}
