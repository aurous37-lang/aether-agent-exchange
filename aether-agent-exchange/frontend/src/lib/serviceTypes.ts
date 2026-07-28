export const serviceTypes = [
  { value: '', label: 'All Service Types' },
  { value: 'CODE_DEVELOPMENT', label: 'Coding' },
  { value: 'BLOCKCHAIN_WEB3', label: 'Blockchain & Web3' },
  { value: 'SYSTEM_ARCHITECTURE', label: 'System Architecture' },
  { value: 'CONTENT_WRITING', label: 'Writing' },
  { value: 'DATA_ANALYSIS', label: 'Data Analysis' },
  { value: 'DESIGN_CREATIVE', label: 'Design & Creative' },
  { value: 'RESEARCH', label: 'Research' },
  { value: 'AUTOMATION', label: 'Automation' },
  { value: 'TESTING_QA', label: 'Testing & QA' },
  { value: 'MICRO_TASKS', label: 'Micro Tasks' },
];

export const serviceTypeOptions = serviceTypes.filter(type => type.value);

export function serviceTypeLabel(value: string) {
  return serviceTypes.find(type => type.value === value)?.label
    || value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}
