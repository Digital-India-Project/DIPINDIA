import {
  Calendar,
  CheckSquare,
  FilePlus2,
  MapPin,
  PenLine,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import {
  SignatureConfig,
  SignatureLayoutPreset,
  TemplateDetail,
} from '../shared/types';

export interface SchemaSignatureDetection {
  preset: SignatureLayoutPreset;
  partyCount: number;
  witnessCount: number;
  signerName: string;
  signerRole: string;
  secondPartyName: string;
  secondPartyRole: string;
  additionalSignatories: Array<{ name: string; role: string }>;
  witness1Name: string;
  witness1Address: string;
  witness2Name: string;
  witness2Address: string;
  witness3Name: string;
  witness3Address: string;
  signedAtPlace: string;
  signatureDate: string;
  summaryText: string;
}

export function detectPartiesAndWitnessesFromSchema(
  template: TemplateDetail,
  formValues: Record<string, string>,
  repeatableValues: Record<string, Array<Record<string, string>>>
): SchemaSignatureDetection {
  const combinedCat = `${template.categoryGroup} ${template.rawCategory} ${template.title}`.toLowerCase();
  const bodyText = template.tokenizedTemplate || template.preservedSourceText || '';

  const findValueByHints = (hints: RegExp): string => {
    for (const f of template.fields) {
      if (f.repeatableGroupId) continue;
      if (hints.test(f.fieldId) || hints.test(f.label)) {
        const val = (formValues[f.fieldId] || '').trim();
        if (val) return val;
      }
    }
    return '';
  };

  // 1. Inspect Schema Fields for Party Groups
  const firstPartyFields = template.fields.filter(
    (f) =>
      !f.repeatableGroupId &&
      (f.group === 'Applicant details' || f.group === 'First party details')
  );
  const secondPartyFields = template.fields.filter(
    (f) => !f.repeatableGroupId && f.group === 'Second party details'
  );
  const hasAdvocateField = template.fields.some(
    (f) =>
      f.group === 'Court details' &&
      /\b(advocate|counsel|pleader)\b/i.test(`${f.fieldId} ${f.label}`)
  );
  const thirdPartyField = template.fields.find(
    (f) =>
      !f.repeatableGroupId &&
      /\b(third_party|party_3|guarantor|surety|confirming_party|co_applicant)\b/i.test(
        `${f.fieldId} ${f.label}`
      )
  );

  // Detect preset & default roles from schema
  let preset: SignatureLayoutPreset = 'two_party';
  let role1 = 'First Party / Executant';
  let role2 = 'Second Party / Counterparty';

  if (/\bwill|codicil|testament/.test(combinedCat)) {
    preset = 'will_attestation';
    role1 = 'Testator / Testatrix';
    role2 = '';
  } else if (
    /\bpetition|plaint|pleading|writ|appeal|complaint|written statement/.test(combinedCat) ||
    hasAdvocateField
  ) {
    preset = 'petitioner_advocate';
    role1 = 'Petitioner / Plaintiff';
    role2 = 'Advocate for Petitioner';
  } else if (
    /\baffidavit|declaration|undertaking/.test(combinedCat) &&
    secondPartyFields.length === 0
  ) {
    preset = 'single_deponent';
    role1 = 'Deponent / Executant';
    role2 = '';
  } else if (secondPartyFields.length > 0 || /\bagreement|deed|lease|rent|mou|poa|power of attorney|notice/.test(combinedCat)) {
    preset = 'two_party';
    if (/\brent|leave and license|lease/.test(combinedCat)) {
      role1 = 'Licensor / Landlord';
      role2 = 'Licensee / Tenant';
    } else if (/\bsale\b/.test(combinedCat)) {
      role1 = 'Vendor / Seller';
      role2 = 'Purchaser / Buyer';
    } else if (/\bgift\b/.test(combinedCat)) {
      role1 = 'Donor';
      role2 = 'Donee';
    } else if (/\bpower of attorney/.test(combinedCat)) {
      role1 = 'Principal / Executant';
      role2 = 'Attorney / Agent';
    }
  } else if (firstPartyFields.length > 0 && secondPartyFields.length === 0) {
    preset = 'single_deponent';
    role1 = 'Executant / Applicant';
    role2 = '';
  }

  const signerName =
    findValueByHints(
      /applicant_name|first_party_name|deponent_name|licensor_name|petitioner_name|testator_name|vendor_name|donor_name|primaryPartyName|name_of_party_1/i
    ) ||
    (firstPartyFields[0] ? (formValues[firstPartyFields[0].fieldId] || '').trim() : '');

  const secondPartyName =
    findValueByHints(
      /second_party_name|licensee_name|respondent_name|opposite_party_name|purchaser_name|donee_name|attorney_name|advocate_name/i
    ) ||
    (secondPartyFields[0] ? (formValues[secondPartyFields[0].fieldId] || '').trim() : '');

  // Additional parties (3rd party field + repeatable additional_parties)
  const additionalSignatories: Array<{ name: string; role: string }> = [];
  if (thirdPartyField) {
    additionalSignatories.push({
      name: (formValues[thirdPartyField.fieldId] || '').trim(),
      role: thirdPartyField.label || 'Third Party / Guarantor',
    });
  }
  const extraParties = repeatableValues['additional_parties'] || [];
  for (const p of extraParties) {
    const n = (p.extra_party_name || '').trim();
    const r = (p.extra_party_role || 'Additional Party').trim();
    if (n || r) {
      additionalSignatories.push({ name: n, role: r });
    }
  }

  const basePartyCount =
    preset === 'single_deponent' || preset === 'will_attestation'
      ? secondPartyName
        ? 2
        : 1
      : 2;
  const partyCount = basePartyCount + additionalSignatories.length;

  // 2. Inspect Schema & Repeatable Sections for Witness Count
  const witnessFields = template.fields.filter(
    (f) => !f.repeatableGroupId && (f.group === 'Witness details' || /witness/i.test(f.fieldId))
  );
  const repeatableWitnessSection = template.repeatableSections.find(
    (s) => s.groupId === 'witnesses'
  );
  const repeatableWitnesses = repeatableValues['witnesses'] || [];

  let witnessCount = 0;
  if (repeatableWitnesses.length > 0) {
    witnessCount = Math.min(3, repeatableWitnesses.length);
  } else if (witnessFields.length > 0) {
    const hasW3 = witnessFields.some((f) => /3|three/i.test(`${f.fieldId} ${f.label}`));
    const hasW2 = witnessFields.some((f) => /2|two/i.test(`${f.fieldId} ${f.label}`));
    witnessCount = hasW3 ? 3 : hasW2 ? 2 : 2;
  } else if (/\bwitness(?:es)?\s*(?:2|two)\b|in the presence of(?:\s+two)?\s+witnesses/i.test(bodyText)) {
    witnessCount = 2;
  } else if (/\bwitness\b/i.test(bodyText)) {
    witnessCount = 2;
  } else if (
    preset === 'will_attestation' ||
    (repeatableWitnessSection && (repeatableWitnessSection.minItems > 0 || preset === 'two_party'))
  ) {
    witnessCount = 2;
  }

  const witness1Name =
    repeatableWitnesses[0]?.witness_name ||
    findValueByHints(/witness_1_name|witness1_name|first_witness/i) ||
    '';
  const witness1Address =
    repeatableWitnesses[0]?.witness_address ||
    findValueByHints(/witness_1_address|witness1_address/i) ||
    '';
  const witness2Name =
    repeatableWitnesses[1]?.witness_name ||
    findValueByHints(/witness_2_name|witness2_name|second_witness/i) ||
    '';
  const witness2Address =
    repeatableWitnesses[1]?.witness_address ||
    findValueByHints(/witness_2_address|witness2_address/i) ||
    '';
  const witness3Name =
    repeatableWitnesses[2]?.witness_name ||
    findValueByHints(/witness_3_name|witness3_name|third_witness/i) ||
    '';
  const witness3Address =
    repeatableWitnesses[2]?.witness_address ||
    findValueByHints(/witness_3_address|witness3_address/i) ||
    '';

  const signedAtPlace =
    findValueByHints(/place_of_execution|execution_place|place|city|district/i) || '';
  const signatureDate = formValues['execution_date'] || '';

  return {
    preset,
    partyCount,
    witnessCount,
    signerName,
    signerRole: role1,
    secondPartyName,
    secondPartyRole: role2,
    additionalSignatories,
    witness1Name,
    witness1Address,
    witness2Name,
    witness2Address,
    witness3Name,
    witness3Address,
    signedAtPlace,
    signatureDate,
    summaryText: `Schema detected: ${partyCount} ${partyCount === 1 ? 'party' : 'parties'} · ${witnessCount} ${
      witnessCount === 1 ? 'witness' : 'witnesses'
    }`,
  };
}

interface GeneratorProps {
  value: SignatureConfig;
  schemaSummary?: string;
  onChange: (next: SignatureConfig) => void;
  onSyncFromSchema: () => void;
  onInjectIntoText: (blockText: string) => void;
}

const PRESET_OPTIONS: Array<{
  id: SignatureLayoutPreset;
  title: string;
  desc: string;
  defaultRole1: string;
  defaultRole2: string;
  defaultWitnesses: number;
}> = [
  {
    id: 'single_deponent',
    title: 'Single Deponent / Executant',
    desc: 'Affidavits, declarations & undertakings',
    defaultRole1: 'Deponent / Executant',
    defaultRole2: '',
    defaultWitnesses: 0,
  },
  {
    id: 'two_party',
    title: 'Two-Party Agreement',
    desc: 'Agreements, leases, MoUs & deeds',
    defaultRole1: 'First Party / Executant',
    defaultRole2: 'Second Party / Counterparty',
    defaultWitnesses: 2,
  },
  {
    id: 'petitioner_advocate',
    title: 'Petitioner & Advocate',
    desc: 'Plaints, petitions, replies & notices',
    defaultRole1: 'Petitioner / Plaintiff',
    defaultRole2: 'Advocate for Petitioner',
    defaultWitnesses: 0,
  },
  {
    id: 'will_attestation',
    title: 'Will (Sec. 63 Succession Act)',
    desc: 'Testator + 2 mandatory attesting witnesses',
    defaultRole1: 'Testator / Testatrix',
    defaultRole2: '',
    defaultWitnesses: 2,
  },
];

export function buildPlainTextSignatureBlock(sig: SignatureConfig, fallbackDate?: string): string {
  const isTwoParty =
    sig.layoutPreset === 'two_party' ||
    sig.layoutPreset === 'petitioner_advocate' ||
    Boolean(sig.secondPartyName?.trim());
  const dateLine = sig.signatureDate || fallbackDate || '____ / ____ / 20____';
  const placeLine = sig.signedAtPlace || '______________________';
  const includeDates = sig.includeDateLines !== false;
  const wCount = sig.witnessCount ?? 2;

  const lines: string[] = [
    '',
    '------------------------------------------------------------------------',
    'IN WITNESS WHEREOF, the executant(s) have signed this document:',
    '',
    `1. ${sig.signerRole || 'Executant'}: ${sig.signerName || '______________________________'}`,
    '   Signature: ______________________________ (Draft Placeholder)',
  ];
  if (includeDates) {
    lines.push(`   Date: ${dateLine}        Place: ${placeLine}`);
  }

  if (isTwoParty) {
    lines.push(
      '',
      `2. ${sig.secondPartyRole || 'Second Party'}: ${
        sig.secondPartyName || '______________________________'
      }`,
      '   Signature: ______________________________'
    );
    if (includeDates) {
      lines.push(`   Date: ${dateLine}        Place: ${placeLine}`);
    }
  }

  if (sig.additionalSignatories && sig.additionalSignatories.length > 0) {
    sig.additionalSignatories.forEach((extra, idx) => {
      lines.push(
        '',
        `${idx + 3}. ${extra.role || 'Additional Party'}: ${
          extra.name || '______________________________'
        }`,
        '   Signature: ______________________________'
      );
      if (includeDates) {
        lines.push(`   Date: ${dateLine}        Place: ${placeLine}`);
      }
    });
  }

  if (wCount > 0) {
    lines.push('', 'SIGNED AND DELIVERED IN THE PRESENCE OF WITNESSES:');
    const witnesses = [
      { name: sig.witness1Name, addr: sig.witness1Address },
      { name: sig.witness2Name, addr: sig.witness2Address },
      { name: sig.witness3Name, addr: sig.witness3Address },
    ].slice(0, wCount);

    witnesses.forEach((w, idx) => {
      lines.push(
        '',
        `Witness ${idx + 1}: ______________________________ (Signature)`,
        `Name: ${w.name || '______________________________'}`,
        `Address: ${w.addr || '________________________________________________'}`
      );
    });
  }

  return lines.join('\n');
}

export function DigitalSignatureGeneratorControls({
  value,
  schemaSummary,
  onChange,
  onSyncFromSchema,
  onInjectIntoText,
}: GeneratorProps) {
  const isEnabled = value.enabled !== false;
  const preset = value.layoutPreset || 'two_party';
  const wCount =
    value.witnessCount ?? (preset === 'single_deponent' || preset === 'petitioner_advocate' ? 0 : 2);
  const showSecondParty =
    preset === 'two_party' || preset === 'petitioner_advocate' || Boolean(value.secondPartyName);
  const additionalList = value.additionalSignatories || [];

  const selectPreset = (p: (typeof PRESET_OPTIONS)[number]) => {
    onChange({
      ...value,
      enabled: true,
      layoutPreset: p.id,
      signerRole: p.defaultRole1,
      secondPartyRole: p.defaultRole2,
      witnessCount: p.defaultWitnesses,
    });
  };

  return (
    <div className="p-4 bg-[#F7F8FA] border border-slate-200 rounded-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#FF671F] flex items-center gap-1.5">
            <PenLine className="w-3.5 h-3.5" />
            Digital Signature Area Generator
          </h4>
          <p className="text-[11px] text-slate-600">
            {schemaSummary ||
              'Automatically detects schema parties & witnesses and injects guided signature blocks, date lines, and witness fields.'}
          </p>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-medium text-[#202124] cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
            className="rounded border-slate-300 text-[#FF671F]"
          />
          <span>Inject Signature Area</span>
        </label>
      </div>

      {/* Preset Picker */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-slate-700">Execution Layout</span>
          <button
            type="button"
            onClick={onSyncFromSchema}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#FF671F] hover:underline cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Re-Detect Parties &amp; Witnesses from Schema
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {PRESET_OPTIONS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => selectPreset(p)}
              className={`text-left p-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                preset === p.id
                  ? 'bg-[#FFF5F0] border-[#FF671F] text-[#202124]'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <strong className="block text-[#202124]">{p.title}</strong>
              <span className="text-[11px]">{p.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Signatory & Date / Witness Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {showSecondParty && (
          <>
            <div>
              <label className="block font-medium text-[#202124] mb-1">
                Second Party / Advocate Name
              </label>
              <input
                type="text"
                value={value.secondPartyName || ''}
                onChange={(e) =>
                  onChange({ ...value, enabled: true, secondPartyName: e.target.value })
                }
                placeholder="Second party or Advocate name"
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124]"
              />
            </div>
            <div>
              <label className="block font-medium text-[#202124] mb-1">
                Second Signatory Role
              </label>
              <input
                type="text"
                value={value.secondPartyRole || ''}
                onChange={(e) =>
                  onChange({ ...value, enabled: true, secondPartyRole: e.target.value })
                }
                placeholder="e.g., Licensee / Second Party / Advocate"
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124]"
              />
            </div>
          </>
        )}

        <div>
          <label className="block font-medium text-[#202124] mb-1">Signature Date Line</label>
          <input
            type="date"
            value={value.signatureDate || ''}
            onChange={(e) => onChange({ ...value, enabled: true, signatureDate: e.target.value })}
            className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124]"
          />
        </div>

        <div>
          <label className="block font-medium text-[#202124] mb-1">Witness Fields</label>
          <select
            value={String(wCount)}
            onChange={(e) =>
              onChange({ ...value, enabled: true, witnessCount: Number(e.target.value) })
            }
            className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124]"
          >
            <option value="0">No Witness Fields (0)</option>
            <option value="1">1 Witness Field</option>
            <option value="2">2 Witness Fields (Standard Deeds / Wills)</option>
            <option value="3">3 Witness Fields</option>
          </select>
        </div>
      </div>

      {/* Additional Signatories (3rd+ Party) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-slate-700">
            Additional Party Blocks ({additionalList.length})
          </span>
          <button
            type="button"
            onClick={() =>
              onChange({
                ...value,
                enabled: true,
                additionalSignatories: [
                  ...additionalList,
                  { name: '', role: `Party ${additionalList.length + 3}` },
                ],
              })
            }
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#FF671F] hover:underline cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            Add Signatory Block
          </button>
        </div>

        {additionalList.map((extra, idx) => (
          <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs">
            <input
              type="text"
              value={extra.name}
              onChange={(e) => {
                const next = [...additionalList];
                next[idx] = { ...next[idx], name: e.target.value };
                onChange({ ...value, enabled: true, additionalSignatories: next });
              }}
              placeholder="Party full name"
              className="sm:col-span-6 h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124]"
            />
            <input
              type="text"
              value={extra.role}
              onChange={(e) => {
                const next = [...additionalList];
                next[idx] = { ...next[idx], role: e.target.value };
                onChange({ ...value, enabled: true, additionalSignatories: next });
              }}
              placeholder="Role (e.g., Guarantor)"
              className="sm:col-span-5 h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124]"
            />
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  additionalSignatories: additionalList.filter((_, i) => i !== idx),
                })
              }
              title="Remove party block"
              className="sm:col-span-1 text-[#991B1B] inline-flex justify-center cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Witness Addresses when witnesses enabled */}
      {wCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block font-medium text-slate-600 mb-1">
              Witness 1 Address (Optional)
            </label>
            <input
              type="text"
              value={value.witness1Address || ''}
              onChange={(e) =>
                onChange({ ...value, enabled: true, witness1Address: e.target.value })
              }
              placeholder="City / Residential address"
              className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124]"
            />
          </div>
          {wCount >= 2 && (
            <div>
              <label className="block font-medium text-slate-600 mb-1">
                Witness 2 Address (Optional)
              </label>
              <input
                type="text"
                value={value.witness2Address || ''}
                onChange={(e) =>
                  onChange({ ...value, enabled: true, witness2Address: e.target.value })
                }
                placeholder="City / Residential address"
                className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124]"
              />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={value.includeDateLines !== false}
            onChange={(e) =>
              onChange({ ...value, enabled: true, includeDateLines: e.target.checked })
            }
            className="rounded border-slate-300 text-[#FF671F]"
          />
          <CheckSquare className="w-3.5 h-3.5 text-[#138808]" />
          <span>Include Date &amp; Place lines under each signatory</span>
        </label>

        <button
          type="button"
          onClick={() => onInjectIntoText(buildPlainTextSignatureBlock(value))}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#202124] bg-white border border-slate-300 rounded-lg hover:border-[#FF671F] hover:text-[#FF671F] cursor-pointer"
        >
          <FilePlus2 className="w-3.5 h-3.5" />
          Append Text Block to Editor
        </button>
      </div>
    </div>
  );
}

interface PreviewProps {
  signature: SignatureConfig;
  executionDate?: string;
  schemaSummary?: string;
  onConfigureClick?: () => void;
}

export function DigitalSignatureAreaPreview({
  signature,
  executionDate,
  schemaSummary,
  onConfigureClick,
}: PreviewProps) {
  const preset = signature.layoutPreset || 'two_party';
  const isTwoParty =
    preset === 'two_party' ||
    preset === 'petitioner_advocate' ||
    Boolean(signature.secondPartyName?.trim());
  const includeDates = signature.includeDateLines !== false;
  const dateDisplay =
    signature.signatureDate ||
    (executionDate && executionDate !== 'Not Specified' ? executionDate : '____ / ____ / 20____');
  const placeDisplay = signature.signedAtPlace || '__________________';
  const wCount =
    signature.witnessCount ??
    (preset === 'single_deponent' || preset === 'petitioner_advocate' ? 0 : 2);

  const witnesses = [
    { name: signature.witness1Name, addr: signature.witness1Address },
    { name: signature.witness2Name, addr: signature.witness2Address },
    { name: signature.witness3Name, addr: signature.witness3Address },
  ].slice(0, wCount);

  const additionalParties = signature.additionalSignatories || [];

  return (
    <section
      aria-label="Digital Signature Area Visual Guide"
      className="mt-8 pt-5 border-t-2 border-dashed border-[#1E3A8A]/40 space-y-5"
    >
      {/* Guide Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-mono-tabular uppercase tracking-wider text-[#1E3A8A] font-semibold">
          <PenLine className="w-3.5 h-3.5" />
          <span>Digital Signature Area · Execution &amp; Witness Guide</span>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {schemaSummary && (
            <span className="text-[11px] font-mono-tabular text-[#57534E]">
              {schemaSummary}
            </span>
          )}
          {onConfigureClick && (
            <button
              type="button"
              onClick={onConfigureClick}
              className="text-[11px] font-medium text-[#1E3A8A] hover:underline"
            >
              Customize
            </button>
          )}
        </div>
      </div>

      {/* Signatory Grid */}
      <div
        className={`grid grid-cols-1 ${
          isTwoParty || additionalParties.length > 0 ? 'md:grid-cols-2' : ''
        } gap-5`}
      >
        {/* Signatory 1 Box */}
        <div className="relative rounded-md border border-dashed border-[#1E3A8A]/60 bg-[#F8FAFC]/70 p-4 space-y-3">
          <div className="flex items-center justify-between text-[10px] font-mono-tabular uppercase tracking-wider text-[#1E3A8A]">
            <span>Signatory Block 01</span>
            <span>[SIGN HERE]</span>
          </div>

          <div className="min-h-[64px] rounded border border-[#CBD5E1] bg-white flex items-center justify-center p-2">
            {signature.signatureDataUrl ? (
              <img
                src={signature.signatureDataUrl}
                alt="Captured draft signature"
                className="h-14 object-contain"
              />
            ) : (
              <span className="text-xs italic text-[#94A3B8]">
                Signature Line — Wet Ink / Digital e-Sign Placement
              </span>
            )}
          </div>

          <div className="space-y-1 text-xs text-[#1C1917]">
            <p className="font-semibold">
              {signature.signerName || '____________________________'}
            </p>
            <p className="text-[#475569]">{signature.signerRole || 'Executant / Deponent'}</p>
            {includeDates && (
              <div className="pt-1.5 mt-1.5 border-t border-[#E2E8F0] flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono-tabular text-[#475569]">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-[#1E3A8A]" />
                  Date: <strong className="text-[#1C1917]">{dateDisplay}</strong>
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#1E3A8A]" />
                  Place: <strong className="text-[#1C1917]">{placeDisplay}</strong>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Signatory 2 Box */}
        {isTwoParty && (
          <div className="relative rounded-md border border-dashed border-[#0F766E]/60 bg-[#F0FDFA]/50 p-4 space-y-3">
            <div className="flex items-center justify-between text-[10px] font-mono-tabular uppercase tracking-wider text-[#0F766E]">
              <span>Signatory Block 02</span>
              <span>[COUNTERPARTY / ADVOCATE]</span>
            </div>

            <div className="min-h-[64px] rounded border border-[#99F6E4] bg-white flex items-center justify-center p-2">
              <span className="text-xs italic text-[#94A3B8]">
                Signature Line — Counterparty / Advocate
              </span>
            </div>

            <div className="space-y-1 text-xs text-[#1C1917]">
              <p className="font-semibold">
                {signature.secondPartyName || '____________________________'}
              </p>
              <p className="text-[#475569]">
                {signature.secondPartyRole || 'Second Party / Advocate'}
              </p>
              {includeDates && (
                <div className="pt-1.5 mt-1.5 border-t border-[#CCFBF1] flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono-tabular text-[#475569]">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[#0F766E]" />
                    Date: <strong className="text-[#1C1917]">{dateDisplay}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#0F766E]" />
                    Place: <strong className="text-[#1C1917]">{placeDisplay}</strong>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Additional Signatory Blocks (3+) */}
        {additionalParties.map((extra, idx) => (
          <div
            key={idx}
            className="relative rounded-md border border-dashed border-[#4338CA]/50 bg-[#EEF2FF]/40 p-4 space-y-3"
          >
            <div className="flex items-center justify-between text-[10px] font-mono-tabular uppercase tracking-wider text-[#4338CA]">
              <span>Signatory Block 0{idx + 3}</span>
              <span>[ADDITIONAL PARTY]</span>
            </div>

            <div className="min-h-[64px] rounded border border-[#C7D2FE] bg-white flex items-center justify-center p-2">
              <span className="text-xs italic text-[#94A3B8]">
                Signature Line — {extra.role || 'Additional Party'}
              </span>
            </div>

            <div className="space-y-1 text-xs text-[#1C1917]">
              <p className="font-semibold">
                {extra.name || '____________________________'}
              </p>
              <p className="text-[#47534E]">{extra.role || 'Additional Party'}</p>
              {includeDates && (
                <div className="pt-1.5 mt-1.5 border-t border-[#E0E7FF] flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono-tabular text-[#475569]">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[#4338CA]" />
                    Date: <strong className="text-[#1C1917]">{dateDisplay}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#4338CA]" />
                    Place: <strong className="text-[#1C1917]">{placeDisplay}</strong>
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Witness Attestation Fields */}
      {witnesses.length > 0 && (
        <div className="space-y-2.5 pt-2">
          <div className="flex items-center gap-1.5 text-[11px] font-mono-tabular uppercase tracking-wider text-[#047857] font-semibold">
            <Users className="w-3.5 h-3.5" />
            <span>Attesting Witnesses ({witnesses.length})</span>
          </div>

          <div
            className={`grid grid-cols-1 ${
              witnesses.length >= 2 ? 'sm:grid-cols-2' : ''
            } gap-3`}
          >
            {witnesses.map((w, idx) => (
              <div
                key={idx}
                className="p-3 rounded-md border border-dashed border-[#047857]/50 bg-[#ECFDF5]/40 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between text-[10px] font-mono-tabular uppercase text-[#065F46]">
                  <span>Witness {idx + 1}</span>
                  <span>[WITNESS SIGN]</span>
                </div>
                <div className="h-8 border-b border-[#047857]/40 bg-white/80 rounded-t px-2 flex items-end pb-1 text-[11px] italic text-[#94A3B8]">
                  Signature:
                </div>
                <div className="space-y-0.5 text-[11px] text-[#1C1917]">
                  <p>
                    <span className="text-[#57534E]">Name:</span>{' '}
                    <strong>{w.name || '______________________'}</strong>
                  </p>
                  <p>
                    <span className="text-[#57534E]">Address:</span>{' '}
                    <span>{w.addr || '______________________'}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
