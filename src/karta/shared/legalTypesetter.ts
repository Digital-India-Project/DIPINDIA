export interface PreviewSegment {
  text: string;
  replaced: boolean;
}

export type LegalBlockKind =
  | 'court_caption'
  | 'instrument_title'
  | 'cause_party'
  | 'cause_versus'
  | 'salutation'
  | 'recital_clause'
  | 'section_heading'
  | 'numbered_clause'
  | 'sub_clause'
  | 'verification_block'
  | 'body';

export interface LegalBlock {
  id: string;
  kind: LegalBlockKind;
  spans: PreviewSegment[];
  leadKeyword?: string;
  clauseMarker?: string;
  partyLeft?: PreviewSegment[];
  partyRole?: string;
  weight: number;
}

const COMMON_SHORT_WORDS = new Set([
  'a',
  'i',
  'an',
  'as',
  'at',
  'be',
  'by',
  'do',
  'go',
  'he',
  'if',
  'in',
  'is',
  'it',
  'me',
  'my',
  'no',
  'of',
  'on',
  'or',
  'so',
  'to',
  'up',
  'us',
  'we',
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'any',
  'can',
  'had',
  'has',
  'her',
  'his',
  'how',
  'its',
  'let',
  'may',
  'new',
  'now',
  'old',
  'one',
  'our',
  'out',
  'own',
  'pay',
  'per',
  'put',
  'say',
  'see',
  'set',
  'she',
  'six',
  'sum',
  'tax',
  'ten',
  'too',
  'two',
  'use',
  'via',
  'was',
  'way',
  'who',
  'why',
  'yes',
  'yet',
  'act',
  'age',
  'day',
  'due',
  'end',
  'far',
  'fee',
  'fit',
  'law',
  'lot',
  'man',
  'men',
  'son',
  'sub',
  's/o',
  'w/o',
  'd/o',
  'r/o',
  'mr',
  'ms',
  'dr',
  'sh',
  'vs',
  'no',
  're',
]);

const MID_WORD_SUFFIXES =
  /^(?:tion|sion|ment|ments|ance|ence|able|ible|ness|less|pany|rpose|tament|tition|titioner|spondent|ing|ed|ly|ity|ies|ied|ers|ors|ist|ism|ant|ent|ary|ory|ous|ful|ize|ise|ate|ify|e|s|es|al|er|or|ry|ty|cy|sy|dy|ny|py|ly)\b/i;

function isStructuralLineStart(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^(?:\d{1,3}(?:\.\d{1,2})?\.|\(\d{1,3}\)|\([a-zivx]{1,4}\)|[a-z]\))\s+/i.test(t)) {
    return true;
  }
  if (
    /^(?:WHEREAS|AND\s+WHEREAS|BETWEEN|AND\b|NOW\s+THIS|NOW\s+KNOW|NOW\s+IT\s+IS|IN\s+WITNESS|THE\s+SCHEDULE|SCHEDULE\b|VERIFICATION|PRAYER|GROUNDS|ATTESTATION|WITNESSES|ANNEXURE|IN\s+THE\s+(?:SUPREME|HIGH|DISTRICT|CIVIL|CRIMINAL|FAMILY|SESSION|COURT)|BEFORE\s+THE|TO\s+ALL\s+TO\s+WHOM|SEND\s+GREETINGS|SHEWETH|MOST\s+RESPECTFULLY|VERSUS|VS\.|SUBJECT:|REF:|DEAR\s+SIR|SIR,|MADAM,|SIGNED|EXECUTED|ADDITIONAL\s+(?:PARTIES|WITNESS)|NO\.\s*\d+|FORM\s+NO\.|Notice\s+of\s+Motion|\(S\.C\.R\.|\(Order\s+[IVXLC]+|In\s+re\b|To\s+the\s+Hon)/i.test(
      t
    )
  ) {
    return true;
  }
  if (t.length <= 75 && t === t.toUpperCase() && /[A-Z]{4,}/.test(t)) {
    return true;
  }
  return false;
}

function isShortHeadingOrCaption(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 92) return false;
  if (t === t.toUpperCase() && /[A-Z]{4,}/.test(t)) return true;
  if (
    /^(?:NO\.\s*\d+|FORM\s+NO\.|IN\s+THE|BEFORE\s+THE|TO\s+THE\s+HON|Civil|Criminal|Writ|Suit|Case\s+No|Appeal|Original|Appellate|Petition|Notice\s+of|Agreement|Deed|Will|Affidavit|Power\s+of\s+Attorney|Special\s+Power|General\s+Power|Memorandum|Leave\s+and\s+Licen|Schedule|Prayer|Verification|Grounds|Witnesses|Sheweth|Versus|Vs\.|\(S\.C\.R|\(Order)/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /(?:Petitioner|Respondent|Appellant|Plaintiff|Defendant|Applicant|Co-respondent|Complainant)\s*\.?$/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

function cleanPlainSegmentText(raw: string): string {
  let text = raw
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n');

  // Fix glued legal recitals and headings extracted without spacing from legacy PDFs/RTFs
  text = text
    .replace(/([A-Z]{4,}(?:\s+[A-Z]{2,})+)\s+(THIS\s+(?:AGREEMENT|DEED|INDENTURE|POWER|WILL|MEMORANDUM|NOTICE|PETITION|AFFIDAVIT|BOND)\b)/g, '$1\n\n$2')
    .replace(/\b(WHEREAS|AND\s+WHEREAS)([a-z])/g, '$1 $2')
    .replace(/\b(AGREEMENT|DEED|INDENTURE|PETITION|AFFIDAVIT|MEMORANDUM|NOTICE)(is|made|executed|between)\b/g, '$1 $2')
    .replace(/\b([A-Z]{5,})(BEFORE\s+THE|IN\s+THE)\b/g, '$1\n\n$2')
    .replace(/COME:(WE\b)/g, 'COME:\n\n$1')
    .replace(/([A-Za-z])(WHEREAS|AND\s+WHEREAS|NOW\s+THIS\s+(?:DEED|AGREEMENT|INDENTURE)\s+WITNESSETH|NOW\s+IT\s+IS\s+HEREBY\s+AGREED|NOW\s+KNOW\s+YOU\s+ALL)\b/g, '$1\n\n$2')
    .replace(/\b(THIS\s+(?:AGREEMENT|DEED|INDENTURE)|WHEREAS|AND\s+WHEREAS|NOW\s+THIS\s+(?:DEED|AGREEMENT|INDENTURE)\s+WITNESSETH|NOW\s+IT\s+IS\s+HEREBY\s+AGREED|NOW\s+KNOW\s+YOU\s+ALL|IN\s+WITNESS\s+WHEREOF|THE\s+SCHEDULE\s+ABOVE\s+REFERRED\s+TO)\b/g, (m, _g1, offset) => {
      if (offset === 0) return m;
      return `\n\n${m}`;
    });

  // Remove orphaned leading dots left by wrapped blanks (e.g. "\n.aforesaid" -> " aforesaid")
  text = text.replace(/\n\.{1,3}(?=[A-Za-z])/g, ' ');
  // Remove orphaned dot line right after clause number ("1.\n. I, devise" -> "1. I, devise")
  text = text.replace(/(\b\d{1,3}\.)\s*\n\.+\s*/g, '$1 ');

  // Normalize excessive blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  // Unwrap single soft line breaks inside prose while preserving mid-word wraps and structural breaks
  const lines = text.split('\n');
  const outLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const curr = lines[i];
    if (outLines.length === 0) {
      outLines.push(curr);
      continue;
    }

    const prev = outLines[outLines.length - 1];
    const prevTrim = prev.trim();
    const currTrim = curr.trim();

    // Explicit blank line boundary -> preserve paragraph break
    if (prevTrim === '' || currTrim === '') {
      outLines.push(curr);
      continue;
    }

    // Rejoin long wrapped opening titles (e.g. "Special Power of Attorney ... before\nSub-Registrar")
    if (
      outLines.length <= 2 &&
      prevTrim.length >= 60 &&
      currTrim.length <= 42 &&
      !/[.!?:]$/.test(prevTrim) &&
      !isStructuralLineStart(currTrim)
    ) {
      outLines[outLines.length - 1] = `${prevTrim} ${currTrim}`;
      continue;
    }

    // Preserve line breaks around headings, court captions, cause title lines, or numbered clauses
    if (isShortHeadingOrCaption(prevTrim) || isStructuralLineStart(currTrim)) {
      outLines.push(curr);
      continue;
    }

    // If previous line clearly ends a sentence/paragraph with colon or period before a capitalized new clause
    if (/[:;]$/.test(prevTrim)) {
      outLines.push(curr);
      continue;
    }

    // Check for mid-word split across single newline (e.g., "th\ne", "Tes\ntament", "com\npany")
    const leftWordMatch = prev.match(/([A-Za-z]+)$/);
    const rightWordMatch = curr.match(/^([a-z]+)/);

    if (leftWordMatch && rightWordMatch) {
      const leftWord = leftWordMatch[1];
      const rightWord = rightWordMatch[1];
      const leftLower = leftWord.toLowerCase();

      const isKnownShortWord = COMMON_SHORT_WORDS.has(leftLower);
      const looksLikeSplitSuffix = MID_WORD_SUFFIXES.test(rightWord);

      if ((!isKnownShortWord && leftWord.length <= 4) || (leftWord.length <= 6 && looksLikeSplitSuffix && !isKnownShortWord)) {
        outLines[outLines.length - 1] = prev + currTrim;
        continue;
      }
    }

    // Otherwise unwrap soft newline into a clean single space
    outLines[outLines.length - 1] = `${prevTrim} ${currTrim}`;
  }

  return outLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ');
}

function normalizeSegments(rawSegments: PreviewSegment[]): PreviewSegment[] {
  // Collapse adjacent segments with same replaced flag first
  const merged: PreviewSegment[] = [];
  for (const seg of rawSegments) {
    if (!seg.text) continue;
    const cleanedText = seg.replaced
      ? seg.text
      : cleanPlainSegmentText(seg.text);
    const prev = merged[merged.length - 1];
    if (prev && prev.replaced === seg.replaced) {
      prev.text += cleanedText;
    } else {
      merged.push({ text: cleanedText, replaced: seg.replaced });
    }
  }

  // Clean stray boundary dot debris and missing spaces around replaced tokens
  for (let i = 0; i < merged.length - 1; i++) {
    const cur = merged[i];
    const nxt = merged[i + 1];

    if (cur.replaced && !nxt.replaced) {
      // Remove orphaned dot leaders right after a filled value e.g. "[Value]..day" -> "[Value] day"
      nxt.text = nxt.text.replace(/^\.{2,}(?=[A-Za-z])/, ' ');
      nxt.text = nxt.text.replace(/^\.(?=[A-Za-z]{2,})/, ' ');
      // Add space if filled value touches lowercase word without space
      if (/[A-Za-z0-9\]]$/.test(cur.text) && /^[A-Za-z]/.test(nxt.text)) {
        nxt.text = ` ${nxt.text}`;
      }
    }
    if (!cur.replaced && nxt.replaced) {
      // Collapse newline directly between prose and token (unless structural)
      if (/\n$/.test(cur.text) && !/\n\n$/.test(cur.text)) {
        const beforeNl = cur.text.slice(0, -1);
        const lastLine = beforeNl.split('\n').pop()?.trim() || '';
        if (lastLine && !isShortHeadingOrCaption(lastLine)) {
          cur.text = `${beforeNl} `;
        }
      }
      if (/[A-Za-z0-9,]$/.test(cur.text) && /^[A-Za-z0-9\[]/.test(nxt.text)) {
        cur.text = `${cur.text} `;
      }
    }
  }

  // Collapse soft single newlines across segments if an unreplaced newline sits between prose and token
  return merged;
}

function splitSegmentsIntoParagraphs(segments: PreviewSegment[]): PreviewSegment[][] {
  const paragraphs: PreviewSegment[][] = [];
  let current: PreviewSegment[] = [];

  const pushParagraph = () => {
    const full = current.map((s) => s.text).join('').trim();
    if (full.length > 0) {
      // Trim leading whitespace on first span & trailing whitespace on last span
      const trimmedSpans = current.map((s) => ({ ...s }));
      while (trimmedSpans.length > 0 && trimmedSpans[0].text.trim() === '') {
        trimmedSpans.shift();
      }
      while (
        trimmedSpans.length > 0 &&
        trimmedSpans[trimmedSpans.length - 1].text.trim() === ''
      ) {
        trimmedSpans.pop();
      }
      if (trimmedSpans.length > 0) {
        trimmedSpans[0].text = trimmedSpans[0].text.replace(/^\s+/, '');
        const last = trimmedSpans[trimmedSpans.length - 1];
        last.text = last.text.replace(/\s+$/, '');
        paragraphs.push(trimmedSpans);
      }
    }
    current = [];
  };

  for (const seg of segments) {
    const parts = seg.text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].length > 0) {
        current.push({ text: parts[i], replaced: seg.replaced });
      }
      if (i < parts.length - 1) {
        pushParagraph();
      }
    }
  }
  pushParagraph();

  return paragraphs;
}

function sliceLeadingText(spans: PreviewSegment[], charCount: number): PreviewSegment[] {
  const out: PreviewSegment[] = [];
  let remaining = charCount;
  for (const s of spans) {
    if (remaining <= 0) {
      out.push({ ...s });
      continue;
    }
    if (s.text.length <= remaining) {
      remaining -= s.text.length;
    } else {
      out.push({ text: s.text.slice(remaining).replace(/^\s+/, ''), replaced: s.replaced });
      remaining = 0;
    }
  }
  return out.filter((s) => s.text.length > 0);
}

function stripTrailingText(spans: PreviewSegment[], suffixLen: number): PreviewSegment[] {
  const totalLen = spans.reduce((sum, s) => sum + s.text.length, 0);
  const keepLen = Math.max(0, totalLen - suffixLen);
  const out: PreviewSegment[] = [];
  let taken = 0;

  for (const s of spans) {
    if (taken >= keepLen) break;
    const avail = keepLen - taken;
    if (s.text.length <= avail) {
      out.push({ ...s });
      taken += s.text.length;
    } else {
      out.push({ text: s.text.slice(0, avail), replaced: s.replaced });
      taken += avail;
    }
  }
  if (out.length > 0) {
    out[out.length - 1].text = out[out.length - 1].text.replace(/[\s.…_-]+$/, '');
  }
  return out.filter((s) => s.text.length > 0);
}

function estimateBlockWeight(kind: LegalBlockKind, fullText: string): number {
  const lineChars = kind === 'numbered_clause' ? 68 : kind === 'sub_clause' ? 64 : 74;
  const wrappedLines = Math.max(1, Math.ceil(fullText.length / lineChars));
  switch (kind) {
    case 'instrument_title':
      return wrappedLines * 1.45 + 1.4;
    case 'court_caption':
      return wrappedLines * 1.15 + 0.35;
    case 'cause_versus':
      return 1.3;
    case 'cause_party':
      return wrappedLines * 1.05 + 0.4;
    case 'section_heading':
      return wrappedLines * 1.2 + 1.1;
    case 'salutation':
      return wrappedLines * 1.1 + 0.5;
    case 'recital_clause':
      return wrappedLines * 1.15 + 0.7;
    case 'numbered_clause':
    case 'sub_clause':
      return wrappedLines * 1.14 + 0.6;
    case 'verification_block':
      return wrappedLines * 1.15 + 0.8;
    default:
      return wrappedLines * 1.14 + 0.55;
  }
}

export function parseLegalBlocks(rawSegments: PreviewSegment[]): LegalBlock[] {
  const normalized = normalizeSegments(rawSegments);
  const paragraphs = splitSegmentsIntoParagraphs(normalized);

  const blocks: LegalBlock[] = [];
  let seenMainTitle = false;

  for (let idx = 0; idx < paragraphs.length; idx++) {
    const spans = paragraphs[idx];
    const fullText = spans.map((s) => s.text).join('').trim();
    if (!fullText) continue;

    // 1. Court Caption Lines
    if (
      /^(?:IN\s+THE\s+(?:SUPREME|HIGH|DISTRICT|CIVIL|CRIMINAL|FAMILY|SESSION|LABOUR|COMMERCIAL|COURT)|BEFORE\s+THE\b|TO\s+THE\s+HON(?:'|’)?BLE|\[?(?:Appellate|Original|Civil|Criminal|Writ)\s+Jurisdiction\]?|\(S\.C\.R\.|(?:Civil|Criminal|Writ)\s+(?:Misc\.?\s*)?(?:Petition|Appeal|Suit|Application)\s+No\.|Case\s+No\.|NO\.\s*\d+\b)/i.test(
        fullText
      ) &&
      fullText.length < 130
    ) {
      blocks.push({
        id: `blk_${idx}`,
        kind: 'court_caption',
        spans,
        weight: estimateBlockWeight('court_caption', fullText),
      });
      continue;
    }

    // 2. Cause Title "Versus"
    if (/^(?:VERSUS|VS\.?|V\/S\.?)$/i.test(fullText)) {
      blocks.push({
        id: `blk_${idx}`,
        kind: 'cause_versus',
        spans: [{ text: 'VERSUS', replaced: false }],
        weight: 1.3,
      });
      continue;
    }

    // 3. Cause Title Party Row ("AB ...... Petitioner", "CB ...... Respondent")
    const partyMatch = fullText.match(
      /^(.+?)(?:[\s.…_-]{2,}|\s+)((?:Co-)?(?:Petitioner|Respondent|Appellant|Plaintiff|Defendant|Applicant|Complainant|Accused)(?:\(s\)|s)?\.?)$/i
    );
    if (partyMatch && fullText.length < 150 && !/^(?:that|whereas|1\.|\(1\))/i.test(fullText)) {
      const roleStr = partyMatch[2].trim();
      const leftSpans = stripTrailingText(spans, partyMatch[2].length);
      blocks.push({
        id: `blk_${idx}`,
        kind: 'cause_party',
        spans,
        partyLeft: leftSpans.length > 0 ? leftSpans : [{ text: partyMatch[1].trim(), replaced: false }],
        partyRole: roleStr,
        weight: estimateBlockWeight('cause_party', fullText),
      });
      continue;
    }

    // 4. Primary Instrument Title (first prominent short title or deed heading)
    if (
      !seenMainTitle &&
      idx <= 3 &&
      fullText.length <= 125 &&
      (/^(?:[A-Z0-9]{2,6}\s+)?(?:AGREEMENT|DEED|SALE\s+DEED|LEASE|RENT\s+AGREEMENT|LEAVE\s+AND\s+LICEN|POWER\s+OF\s+ATTORNEY|SPECIAL\s+POWER|GENERAL\s+POWER|AFFIDAVIT|WILL|LAST\s+WILL|MEMORANDUM|NOTICE|LEGAL\s+NOTICE|PETITION|PLAINT|COMPLAINT|WRIT|INDEMNITY|BOND|GIFT\s+DEED|PARTITION|SETTLEMENT|EMPLOYMENT|NDA|NON-DISCLOSURE|AUTHORIZATION|DECLARATION|UNDERTAKING)/i.test(
        fullText
      ) ||
        (idx === 0 && fullText === fullText.toUpperCase() && fullText.length >= 6))
    ) {
      seenMainTitle = true;
      let mergedSpans = spans;
      let mergedText = fullText;
      if (
        /\b(?:before|of|for|to|in|under|with|by|on|and)$/i.test(fullText) &&
        idx + 1 < paragraphs.length
      ) {
        const nextText = paragraphs[idx + 1].map((s) => s.text).join('').trim();
        if (nextText.length > 0 && nextText.length <= 45 && !isStructuralLineStart(nextText)) {
          mergedSpans = [...spans, { text: ' ', replaced: false }, ...paragraphs[idx + 1]];
          mergedText = `${fullText} ${nextText}`;
          idx += 1;
        }
      }
      blocks.push({
        id: `blk_${idx}`,
        kind: 'instrument_title',
        spans: mergedSpans,
        weight: estimateBlockWeight('instrument_title', mergedText),
      });
      continue;
    }

    // 5. Formal Legal Section Headings (Schedule, Prayer, Grounds, Verification, In Witness)
    if (
      /^(?:THE\s+SCHEDULE(?:\s+ABOVE\s+REFERRED\s+TO)?|SCHEDULE(?:\s+OF\s+PROPERTY)?|PRAYER|GROUNDS|VERIFICATION|ATTESTATION|IN\s+WITNESS\s+WHEREOF|WITNESSES|ANNEXURE|ADDITIONAL\s+PARTIES\s+SCHEDULE|ADDITIONAL\s+WITNESS\s+ATTESTATION)\b[:.]?$/i.test(
        fullText
      ) ||
      (fullText.length <= 80 &&
        fullText === fullText.toUpperCase() &&
        /[A-Z]{4,}/.test(fullText) &&
        !/^(?:WHEREAS|BETWEEN|AND)\b/.test(fullText))
    ) {
      blocks.push({
        id: `blk_${idx}`,
        kind: 'section_heading',
        spans,
        weight: estimateBlockWeight('section_heading', fullText),
      });
      continue;
    }

    // 6. Formal Salutations / Petition Lead-ins
    if (
      /^(?:TO\s+ALL\s+TO\s+WHOM\s+THESE\s+PRESENTS\s+SHALL\s+COME|SEND\s+GREETINGS|SHEWETH:|MOST\s+RESPECTFULLY\s+SHOWETH|The\s+humble\s+petition\s+of\b|The\s+(?:petitioner|applicant|plaintiff|appellant)\s+(?:above\s*named|abovenamed)\s+(?:states|submits|prays)|Subject:|Ref:|Sir\s*\/?\s*Madam,?)/i.test(
        fullText
      )
    ) {
      blocks.push({
        id: `blk_${idx}`,
        kind: 'salutation',
        spans,
        weight: estimateBlockWeight('salutation', fullText),
      });
      continue;
    }

    // 7. Verification / Affirmation Blocks
    if (
      /^(?:Verified\s+at|I,\s+.{2,60}the\s+above\s*named\s+(?:deponent|petitioner|applicant)\s+do\s+hereby\s+verify|Solemnly\s+affirmed\s+at)/i.test(
        fullText
      )
    ) {
      blocks.push({
        id: `blk_${idx}`,
        kind: 'verification_block',
        spans,
        weight: estimateBlockWeight('verification_block', fullText),
      });
      continue;
    }

    // 8. Recital / Deed Operative Lead-Ins (BETWEEN, AND, WHEREAS, AND WHEREAS, NOW THIS DEED...)
    const recitalMatch = fullText.match(
      /^(NOW\s+THIS\s+(?:DEED|AGREEMENT|INDENTURE|POWER)\s+WITNESSETH|NOW\s+IT\s+IS\s+HEREBY\s+AGREED(?:\s+BETWEEN\s+THE\s+PARTIES\s+AS\s+FOLLOWS)?|NOW\s+KNOW\s+YOU\s+ALL(?:\s+AND\s+THESE\s+PRESENTS\s+WITNESS)?|IN\s+WITNESS\s+WHEREOF|AND\s+WHEREAS|WHEREAS|THIS\s+(?:AGREEMENT|DEED|INDENTURE)\b|BETWEEN|AND(?=\s+(?:Shri|Smt|Mr|Mrs|Ms|M\/s|Dr|the|\[\w|1\.|\(1\))))\b[:\s]*/i
    );
    if (recitalMatch) {
      const kw = recitalMatch[1].trim().toUpperCase();
      let rest = sliceLeadingText(spans, recitalMatch[0].length);
      let combinedText = fullText;
      if (rest.length === 0 && idx + 1 < paragraphs.length) {
        const nextText = paragraphs[idx + 1].map((s) => s.text).join('').trim();
        if (
          nextText.length > 0 &&
          !/^(?:\d{1,3}\.|\(\d{1,3}\)|\([a-z]\)|WHEREAS|AND\s+WHEREAS|BETWEEN|THE\s+SCHEDULE|PRAYER|VERIFICATION|IN\s+WITNESS)/i.test(
            nextText
          )
        ) {
          rest = paragraphs[idx + 1];
          combinedText = `${kw} ${nextText}`;
          idx += 1;
        }
      }
      blocks.push({
        id: `blk_${idx}`,
        kind: 'recital_clause',
        leadKeyword: kw,
        spans: rest,
        weight: estimateBlockWeight('recital_clause', combinedText),
      });
      continue;
    }

    // 9. Numbered Clauses (1., 2., (1), (2), 1.1, Clause 1:)
    const numMatch = fullText.match(/^((?:\d{1,3}(?:\.\d{1,2})?\.|\(\d{1,3}\)|Clause\s+\d+[:.]?))\s+/i);
    if (numMatch) {
      const marker = numMatch[1].trim();
      const rest = sliceLeadingText(spans, numMatch[0].length);
      if (rest.length > 0) {
        blocks.push({
          id: `blk_${idx}`,
          kind: 'numbered_clause',
          clauseMarker: marker,
          spans: rest,
          weight: estimateBlockWeight('numbered_clause', fullText),
        });
        continue;
      }
    }

    // 10. Sub-clauses ((a), (b), (i), (ii))
    const subMatch = fullText.match(/^(\([a-zivx]{1,4}\)|[a-z]\))\s+/i);
    if (subMatch) {
      const marker = subMatch[1].trim();
      const rest = sliceLeadingText(spans, subMatch[0].length);
      if (rest.length > 0) {
        blocks.push({
          id: `blk_${idx}`,
          kind: 'sub_clause',
          clauseMarker: marker,
          spans: rest,
          weight: estimateBlockWeight('sub_clause', fullText),
        });
        continue;
      }
    }

    // 11. Standard Body Legal Prose
    blocks.push({
      id: `blk_${idx}`,
      kind: 'body',
      spans,
      weight: estimateBlockWeight('body', fullText),
    });
  }

  return blocks;
}

export function paginateLegalBlocks(
  blocks: LegalBlock[],
  showStampOverlay: boolean,
  showSignatureArea: boolean
): LegalBlock[][] {
  if (blocks.length === 0) return [[]];

  const page1Max = showStampOverlay ? 16 : 33;
  const standardMax = 35;
  const signatureReserve = showSignatureArea ? 12.5 : 0;

  const pages: LegalBlock[][] = [];
  let currentPage: LegalBlock[] = [];
  let currentWeight = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const maxForThisPage = pages.length === 0 ? page1Max : standardMax;

    // Never strand a section heading or instrument title alone at the bottom of a page
    const isHeadingLike =
      block.kind === 'section_heading' ||
      block.kind === 'instrument_title' ||
      block.kind === 'salutation';
    const nextWeight = i + 1 < blocks.length ? Math.min(blocks[i + 1].weight, 5) : 0;
    const effectiveNeed = isHeadingLike ? block.weight + nextWeight : block.weight;

    if (currentPage.length > 0 && currentWeight + effectiveNeed > maxForThisPage) {
      pages.push(currentPage);
      currentPage = [block];
      currentWeight = block.weight;
    } else {
      currentPage.push(block);
      currentWeight += block.weight;
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  // Ensure final page has breathing room for the Digital Signature Area
  if (showSignatureArea && pages.length > 0) {
    const lastIdx = pages.length - 1;
    const lastCapacity = lastIdx === 0 ? page1Max : standardMax;
    const lastWeight = pages[lastIdx].reduce((sum, b) => sum + b.weight, 0);
    if (lastWeight + signatureReserve > lastCapacity) {
      if (pages[lastIdx].length > 2) {
        const moved = pages[lastIdx].splice(-2);
        pages.push(moved);
      } else {
        pages.push([]);
      }
    }
  }

  return pages;
}

export function typesetPlainTextBlocks(content: string): LegalBlock[] {
  return parseLegalBlocks([{ text: content, replaced: false }]);
}
