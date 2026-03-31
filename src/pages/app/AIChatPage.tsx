import { useDeferredValue, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth-context'
import { AppTopBar, type AppShellOutletContext } from '../../components/layout'
import { BrandMark, Icon, ThemeToggle } from '../../components/ui'
import {
  approveGeneratedChecklistItem,
  createAIChatThread,
  deleteAIChatThread,
  fetchAIChatBootstrap,
  fetchAIChatThread,
  fetchAIChatThreads,
  previewAIChatPageLink,
  rejectGeneratedChecklistItem,
  streamChecklistDraft,
  updateAIChatDraftContext,
  type AIChatDraftStreamEvent,
  type AIChatDraftStreamStage,
  type AIChatBootstrap,
  type AIChatDraftContext,
  type AIChatPageLinkPreview,
  type AIChatSourceMode,
  type AIChatThread,
  type AIChatThreadSummary,
  type AIGeneratedChecklistItem,
  type DraftContextPayload,
} from '../../features/ai-chat/api'
import { fetchChecklistBatches, type ChecklistBatch } from '../../features/checklist/api'
import { fetchProjects, type ProjectSummary } from '../../features/projects/api'
import { getErrorMessage } from '../../lib/api'
import { FormMessage, formatChatTime } from '../shared'

export type AIChatPageView = 'landing' | 'create' | 'thread'

type FlowStep = 1 | 2 | 3 | 4 | 5

type DraftFormState = {
  sourceMode: AIChatSourceMode
  projectId: number
  targetMode: 'new' | 'existing'
  existingBatchId: number
  batchTitle: string
  moduleName: string
  submoduleName: string
  pageUrl: string
}

type SummaryRow = {
  label: string
  value: string
  step: Exclude<FlowStep, 5>
  href?: string
}

type ThreadStatusTone = 'draft' | 'review' | 'complete' | 'muted'

type ThreadStatus = {
  label: string
  tone: ThreadStatusTone
}

type ThreadViewTab = 'chat' | 'summary'
type DraftSessionPhase = 'idle' | 'preparing' | 'streaming' | 'reviewing' | 'reconciling' | 'done' | 'error'

type AIChatTransientDraft = {
  requestId: string
  threadId: number
  sourceMode: AIChatSourceMode
  userMessagePreview: string
  attachments: File[]
  reasoningText: string
  phase: DraftSessionPhase
  stage: AIChatDraftStreamStage | 'preparing'
  assistantMessageId?: number
  userMessageId?: number
  assistantName?: string
  errorMessage?: string
}

type ThreadRouteDraftStart = {
  threadId: number
  clientRequestId: string
  message: string
  attachments: File[]
  sourceMode: AIChatSourceMode
}

type SourceChooserOption = {
  mode: AIChatSourceMode
  title: string
  description: string
  requirement: string
  emoji: string
  accent: 'screenshot' | 'link'
}

const sourceChooserOptions: SourceChooserOption[] = [
  {
    mode: 'screenshot',
    title: 'Via screenshot',
    description: 'Upload a screenshot and add the page link.',
    requirement: 'Needs image + link',
    emoji: '🖼️',
    accent: 'screenshot',
  },
  {
    mode: 'link',
    title: 'Via link',
    description: 'Paste a page link. No screenshot needed.',
    requirement: 'Needs link only',
    emoji: '🔗',
    accent: 'link',
  },
]

function createEmptyDraftForm(sourceMode: AIChatSourceMode = 'screenshot'): DraftFormState {
  return {
    sourceMode,
    projectId: 0,
    targetMode: 'new',
    existingBatchId: 0,
    batchTitle: '',
    moduleName: '',
    submoduleName: '',
    pageUrl: '',
  }
}

const flowSteps: Array<{ step: FlowStep; label: string; icon: 'projects' | 'checklist' | 'activity' | 'globe' | 'chat' }> = [
  { step: 1, label: 'Link', icon: 'globe' },
  { step: 2, label: 'Project', icon: 'projects' },
  { step: 3, label: 'Batch', icon: 'checklist' },
  { step: 4, label: 'Module', icon: 'activity' },
  { step: 5, label: 'Chat', icon: 'chat' },
]

const qaSectionHeadingMap = new Map<string, string>([
  ['steps to replicate', 'Steps to replicate'],
  ['steps to reproduce', 'Steps to replicate'],
  ['actual result', 'Actual result'],
  ['actual results', 'Actual result'],
  ['expected result', 'Expected result'],
  ['expected results', 'Expected result'],
  ['preconditions', 'Preconditions'],
  ['test data', 'Test data'],
  ['notes', 'Notes'],
])

function normalizeSourceMode(value: string | null | undefined, fallback: AIChatSourceMode = 'screenshot'): AIChatSourceMode {
  return value === 'link' ? 'link' : fallback
}

function sourceModeRequiresAttachments(sourceMode: AIChatSourceMode) {
  return sourceMode === 'screenshot'
}

function sourceModeLabel(sourceMode: AIChatSourceMode) {
  return sourceMode === 'link' ? 'Via link' : 'Via screenshot'
}

function sourceModeComposerPlaceholder(sourceMode: AIChatSourceMode) {
  return sourceMode === 'link'
    ? 'Describe what the AI should focus on from this page link'
    : 'Describe the module or add extra testing guidance for the uploaded screenshots'
}

function sourceModeComposerHelperText(sourceMode: AIChatSourceMode, isReady: boolean) {
  if (!isReady) {
    return 'Edit the checklist target before drafting new checklist items.'
  }

  return sourceModeRequiresAttachments(sourceMode)
    ? 'At least one image is required for each new checklist draft request.'
    : 'This source mode works from the saved page link. Screenshots are not required.'
}

function isPreviewAcceptedForLink(status: string) {
  return status === 'ready' || status === 'thin_content'
}

function getSourceModeAvailability(bootstrap: AIChatBootstrap, sourceMode: AIChatSourceMode) {
  if (sourceMode === 'link') {
    return {
      enabled: bootstrap.source_modes?.link.enabled ?? bootstrap.enabled,
      warning: bootstrap.source_modes?.link.warning_message ?? '',
    }
  }

  return {
    enabled: bootstrap.source_modes?.screenshot.enabled ?? Boolean(bootstrap.model?.supports_vision),
    warning: bootstrap.source_modes?.screenshot.warning_message ?? '',
  }
}

function isValidPageUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function formatFileSize(size: number) {
  if (size < 1024) {
    return `${size} B`
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function createClientRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeSectionHeading(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')
  return qaSectionHeadingMap.get(normalized) ?? value.trim()
}

function splitFormattedText(value: string) {
  const normalized = value.replace(/\r\n?/g, '\n').trim()
  if (!normalized) {
    return { sections: [] as Array<{ heading?: string; body: string }>, hasSections: false }
  }

  const lines = normalized.split('\n')
  const sections: Array<{ heading?: string; body: string }> = []
  let currentHeading = ''
  let currentBody: string[] = []
  let hasSections = false

  const flush = () => {
    if (!currentHeading && !currentBody.length) {
      return
    }
    sections.push({
      heading: currentHeading || undefined,
      body: currentBody.join('\n').trim(),
    })
    currentHeading = ''
    currentBody = []
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (currentBody.length && currentBody[currentBody.length - 1] !== '') {
        currentBody.push('')
      }
      continue
    }

    const match = trimmed.match(/^(steps?\s+to\s+(?:reproduce|replicate)|actual\s+results?|expected\s+results?|preconditions|test\s+data|notes)\s*:\s*(.*)$/i)
    if (match) {
      flush()
      currentHeading = normalizeSectionHeading(match[1] ?? '')
      hasSections = true
      const remainder = (match[2] ?? '').trim()
      if (remainder) {
        currentBody.push(remainder)
      }
      continue
    }

    currentBody.push(trimmed)
  }

  flush()

  if (!sections.length) {
    return { sections: [{ body: normalized }], hasSections: false }
  }

  return { sections, hasSections }
}

function renderFormattedText(value: string, className: string, blockClassName: string) {
  const parsed = splitFormattedText(value)
  if (!parsed.sections.length) {
    return null
  }

  if (!parsed.hasSections) {
    return <p className={className}>{value}</p>
  }

  return (
    <div className={`${className} ${className}--sectioned`}>
      {parsed.sections.map((section, index) => (
        <div key={`${section.heading ?? 'body'}-${index}`} className={blockClassName}>
          {section.heading ? <strong>{section.heading}</strong> : null}
          {section.body ? <p>{section.body}</p> : null}
        </div>
      ))}
    </div>
  )
}

function mapDraftStageLabel(sourceMode: AIChatSourceMode, stage: AIChatDraftStreamStage | 'preparing') {
  const labels: Record<AIChatDraftStreamStage | 'preparing', string> = {
    preparing: 'Preparing draft',
    analyzing_link: 'Analyzing link',
    reading_page: 'Reading page',
    reading_screenshots: sourceMode === 'link' ? 'Reading evidence' : 'Reading screenshots',
    reasoning: 'Thinking through coverage',
    drafting: 'Drafting checklist items',
    reviewing: 'Reviewing the draft',
    finalizing: 'Finalizing reply',
  }

  return labels[stage]
}

function draftContextToForm(context?: AIChatDraftContext | null): DraftFormState {
  if (!context) {
    return createEmptyDraftForm()
  }

  return {
    sourceMode: context.source_mode === 'link' ? 'link' : 'screenshot',
    projectId: context.project_id ?? 0,
    targetMode: context.target_mode === 'existing' ? 'existing' : 'new',
    existingBatchId: context.existing_batch_id ?? 0,
    batchTitle: context.batch_title ?? '',
    moduleName: context.module_name ?? '',
    submoduleName: context.submodule_name ?? '',
    pageUrl: context.page_url ?? '',
  }
}

function formMatchesContext(form: DraftFormState, context?: AIChatDraftContext | null) {
  if (!context) {
    return false
  }

  return (
    form.sourceMode === normalizeSourceMode(context.source_mode, 'screenshot') &&
    form.projectId === (context.project_id ?? 0) &&
    form.targetMode === (context.target_mode === 'existing' ? 'existing' : 'new') &&
    form.existingBatchId === (context.existing_batch_id ?? 0) &&
    form.batchTitle.trim() === (context.batch_title ?? '').trim() &&
    form.moduleName.trim() === (context.module_name ?? '').trim() &&
    form.submoduleName.trim() === (context.submodule_name ?? '').trim() &&
    form.pageUrl.trim() === (context.page_url ?? '').trim()
  )
}

function buildDraftPayload(form: DraftFormState): DraftContextPayload {
  const pageUrl = form.pageUrl.trim()
  if (!isValidPageUrl(pageUrl)) {
    throw new Error('Link is required and must be a valid http:// or https:// URL.')
  }

  if (form.projectId <= 0) {
    throw new Error('Select a project before drafting checklist items.')
  }

  if (form.targetMode === 'existing') {
    if (form.existingBatchId <= 0) {
      throw new Error('Select an existing checklist batch for this project.')
    }

    return {
      project_id: form.projectId,
      source_mode: form.sourceMode,
      target_mode: 'existing',
      existing_batch_id: form.existingBatchId,
      page_url: pageUrl,
    }
  }

  if (!form.batchTitle.trim() || !form.moduleName.trim()) {
    throw new Error('Batch title and module name are required for a new checklist batch.')
  }

  return {
    project_id: form.projectId,
    source_mode: form.sourceMode,
    target_mode: 'new',
    batch_title: form.batchTitle.trim(),
    module_name: form.moduleName.trim(),
    submodule_name: form.submoduleName.trim(),
    page_url: pageUrl,
  }
}

function duplicateTone(status: string) {
  if (status === 'confirmed_duplicate') {
    return 'warning'
  }
  if (status === 'possible_duplicate') {
    return 'info'
  }
  return 'success'
}

function clampStep(value: number): FlowStep {
  if (value <= 1) {
    return 1
  }
  if (value === 2) {
    return 2
  }
  if (value === 3) {
    return 3
  }
  if (value === 4) {
    return 4
  }
  return 5
}

function getThreadTimestamp(thread: AIChatThreadSummary) {
  const rawValue = thread.last_message_at_iso || thread.updated_at_iso || thread.created_at_iso || thread.last_message_at || thread.updated_at || thread.created_at
  const parsed = Date.parse(rawValue || '')
  return Number.isFinite(parsed) ? parsed : 0
}

function sortThreads(threads: AIChatThreadSummary[]) {
  return [...threads].sort((left, right) => getThreadTimestamp(right) - getThreadTimestamp(left))
}

function formatThreadContextLabel(context?: AIChatDraftContext | null) {
  if (!context?.project_id) {
    return 'Checklist target not set'
  }
  if (context.target_mode === 'existing') {
    return `${context.project_name || 'Project'} / ${context.existing_batch_title || 'Existing batch'}`
  }
  return `${context.project_name || 'Project'} / ${context.batch_title || 'New batch'}`
}

function buildThreadSearchText(thread: AIChatThreadSummary) {
  const context = thread.draft_context
  return [thread.title, context.project_name, context.existing_batch_title, context.batch_title, context.module_name, context.submodule_name]
    .join(' ')
    .trim()
    .toLowerCase()
}

function deriveThreadStatus(thread?: AIChatThread | null, summary?: AIChatThreadSummary | null): ThreadStatus {
  const generatedItems = thread?.messages.flatMap((message) => message.generated_checklist_items) ?? []
  if (generatedItems.some((item) => item.review_status === 'pending')) {
    return { label: 'Needs review', tone: 'review' }
  }
  if (generatedItems.length > 0 && generatedItems.every((item) => item.review_status !== 'pending')) {
    return { label: 'Completed', tone: 'complete' }
  }
  if (thread?.draft_context.is_locked || summary?.draft_context.is_locked) {
    return { label: 'Completed', tone: 'complete' }
  }
  if (thread?.draft_context.project_id || summary?.draft_context.project_id) {
    return { label: 'Drafting', tone: 'draft' }
  }
  return { label: 'Set up', tone: 'muted' }
}

function getThreadModulePreview(summary: AIChatThreadSummary, detail?: AIChatThread | null) {
  const context = detail?.draft_context ?? summary.draft_context
  const moduleName = context.module_name?.trim()
  const submoduleName = context.submodule_name?.trim()
  if (moduleName && submoduleName) {
    return `${moduleName} / ${submoduleName}`
  }
  if (moduleName) {
    return moduleName
  }
  return 'Module details appear once the target is fully set'
}

function buildSummaryRows(form: DraftFormState, projects: ProjectSummary[], selectedBatch: ChecklistBatch | null, fallbackContext?: AIChatDraftContext | null) {
  const isExisting = form.targetMode === 'existing'
  const selectedProject = projects.find((project) => project.id === form.projectId) ?? null
  const sourceValue = sourceModeLabel(form.sourceMode)
  const projectName = selectedProject?.name || fallbackContext?.project_name || 'Not selected'
  const batchValue = isExisting
    ? selectedBatch?.title || fallbackContext?.existing_batch_title || 'No existing batch selected'
    : form.batchTitle.trim() || fallbackContext?.batch_title || 'Not set'
  const moduleValue = isExisting
    ? selectedBatch?.module_name || fallbackContext?.module_name || 'Module will follow the selected batch'
    : form.moduleName.trim() || fallbackContext?.module_name || 'Not set'
  const submoduleValue = isExisting
    ? selectedBatch?.submodule_name || fallbackContext?.submodule_name || ''
    : form.submoduleName.trim() || fallbackContext?.submodule_name || ''
  const pageUrl = form.pageUrl.trim() || selectedBatch?.page_url || fallbackContext?.page_url || ''

  const rows: SummaryRow[] = [
    { label: 'Source', value: sourceValue, step: 1 },
    {
      label: 'Page link',
      value: pageUrl || 'No saved page link',
      step: 1,
      href: pageUrl || undefined,
    },
    { label: 'Project', value: projectName, step: 2 },
    { label: 'Batch', value: batchValue, step: 3 },
    { label: 'Module', value: moduleValue, step: 4 },
  ]

  if (submoduleValue) {
    rows.push({ label: 'Submodule', value: submoduleValue, step: 4 })
  }

  return {
    modeLabel: isExisting ? 'Existing batch' : 'New batch',
    rows,
  }
}

function buildThreadTitle(form: DraftFormState, selectedProject: ProjectSummary | null, selectedBatch: ChecklistBatch | null) {
  if (form.targetMode === 'existing') {
    return selectedBatch?.module_name || selectedBatch?.title || selectedProject?.name || 'New chat'
  }
  return form.moduleName.trim() || form.batchTitle.trim() || selectedProject?.name || 'New chat'
}

function previewFromDraftContext(context?: AIChatDraftContext | null): AIChatPageLinkPreview | null {
  if (!context?.page_url) {
    return null
  }

  return {
    page_url: context.page_url,
    status: context.page_link_status || '',
    page_title: '',
    excerpt: '',
    warning_message: context.page_link_warning || '',
    requires_credentials: context.page_link_status === 'auth_required_basic',
    credentials_saved: context.has_saved_link_credentials,
  }
}

function formatPreviewStatusLabel(status: string) {
  switch (status) {
    case 'ready':
      return 'Ready'
    case 'thin_content':
      return 'Limited content'
    case 'auth_required_basic':
      return 'Needs Basic Auth'
    case 'unsupported_auth':
      return 'Unsupported login'
    case 'unreachable':
      return 'Unreachable'
    case 'invalid':
      return 'Invalid link'
    default:
      return 'Not checked'
  }
}

function previewTone(status: string): 'success' | 'alert' | 'default' {
  if (status === 'ready' || status === 'thin_content') {
    return 'success'
  }
  if (status === 'auth_required_basic' || status === 'unsupported_auth' || status === 'unreachable' || status === 'invalid') {
    return 'alert'
  }
  return 'default'
}

function normalizePositiveInt(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function buildNewChatRoute(sourceMode: AIChatSourceMode) {
  return `/app/ai-chat/new?source=${sourceMode}`
}

function AIChatHeader({ title, subtitle, leading, actions }: { title: string; subtitle: string; leading?: ReactNode; actions?: ReactNode }) {
  return (
    <AppTopBar eyebrow="AI Chat" title={title} subtitle={subtitle} leading={leading} actions={actions} />
  )
}

function AIChatSourceChooser({
  bootstrap,
  open,
  onClose,
  onSelect,
}: {
  bootstrap: AIChatBootstrap
  open: boolean
  onClose: () => void
  onSelect: (sourceMode: AIChatSourceMode) => void
}) {
  if (!open) {
    return null
  }

  return (
    <div className="ai-chat-source-sheet" role="dialog" aria-modal="true" aria-labelledby="ai-chat-source-sheet-title">
      <button type="button" className="ai-chat-source-sheet__backdrop" aria-label="Close source chooser" onClick={onClose} />
      <section className="ai-chat-source-sheet__card">
        <div className="ai-chat-source-sheet__brand">
          <div className="ai-chat-source-sheet__brand-mark">
            <BrandMark />
          </div>
          <button type="button" className="button button--ghost button--tiny" onClick={onClose}>
            Cancel
          </button>
        </div>
        <div className="ai-chat-source-sheet__copy">
          <p className="eyebrow">New chat</p>
          <h2 id="ai-chat-source-sheet-title">What kind of checklist do you want to AI-generate?</h2>
          <p>Choose one simple starting point.</p>
        </div>
        <div className="ai-chat-source-sheet__choices">
          {sourceChooserOptions.map((option) => {
            const availability = getSourceModeAvailability(bootstrap, option.mode)
            return (
              <button
                key={option.mode}
                type="button"
                className={`ai-chat-source-card ai-chat-source-card--${option.accent} ${availability.enabled ? '' : 'is-disabled'}`}
                onClick={() => availability.enabled && onSelect(option.mode)}
                disabled={!availability.enabled}
              >
                <span className="ai-chat-source-card__emoji" aria-hidden="true">
                  {option.emoji}
                </span>
                <span className="ai-chat-source-card__copy">
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
                <span className="pill ai-chat-source-card__pill">{option.requirement}</span>
                {!availability.enabled && availability.warning ? <small className="ai-chat-source-card__warning">{availability.warning}</small> : null}
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function AIChatStateScreen({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="ai-chat-page">
      <AIChatHeader title={title} subtitle={subtitle} actions={<ThemeToggle />} />
      <div className="ai-chat-page__body ai-chat-page__body--centered">
        <section className="ai-chat-state-card">{children}</section>
      </div>
    </div>
  )
}

function AIChatStatusPill({ status }: { status: ThreadStatus }) {
  return <span className={`pill ai-chat-status-pill ai-chat-status-pill--${status.tone}`}>{status.label}</span>
}

function AIChatHistoryCard({
  summary,
  detail,
  active = false,
  onOpen,
  onDelete,
}: {
  summary: AIChatThreadSummary
  detail?: AIChatThread | null
  active?: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  const context = summary.draft_context
  const batchLabel = context.target_mode === 'existing' ? context.existing_batch_title || 'Existing batch' : context.batch_title || 'New batch'
  const preview = getThreadModulePreview(summary, detail)
  const status = deriveThreadStatus(detail, summary)

  return (
    <article
      className={`ai-chat-history-card ${active ? 'is-active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="ai-chat-history-card__body">
        <div className="ai-chat-history-card__headline">
          <strong>{summary.title}</strong>
          <AIChatStatusPill status={status} />
        </div>
        <p>{context.project_name || 'No project selected yet'}</p>
        <p>{batchLabel}</p>
        <small>{preview}</small>
      </div>
      <div className="ai-chat-history-card__aside">
        <span>{formatChatTime(summary.last_message_at || summary.updated_at || summary.created_at, summary.last_message_at_iso || summary.updated_at_iso || summary.created_at_iso)}</span>
        <button
          type="button"
          className="ai-chat-history-card__delete"
          aria-label={`Delete ${summary.title}`}
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
        >
          x
        </button>
      </div>
    </article>
  )
}

function AIChatProgress({ currentStep }: { currentStep: FlowStep }) {
  return (
    <div className="ai-chat-flow__progress">
      {flowSteps.map((item) => {
        const isComplete = item.step < currentStep
        const isActive = item.step === currentStep

        return (
          <div key={item.step} className={`ai-chat-flow__step ${isComplete ? 'is-complete' : ''} ${isActive ? 'is-active' : ''}`}>
            <span className="ai-chat-flow__step-icon" aria-hidden="true">
              {isComplete ? 'OK' : <Icon name={item.icon} />}
            </span>
            <span>{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function AIChatSummaryCard({
  modeLabel,
  rows,
  expanded,
  locked,
  onToggle,
  onEditStep,
  showToggle = true,
}: {
  modeLabel: string
  rows: SummaryRow[]
  expanded: boolean
  locked: boolean
  onToggle: () => void
  onEditStep?: (step: Exclude<FlowStep, 5>) => void
  showToggle?: boolean
}) {
  return (
    <section className="ai-chat-summary-card">
      <div className="ai-chat-summary-card__header">
        <div>
          <p className="eyebrow">Checklist summary</p>
          <h2>Target summary</h2>
        </div>
        {showToggle ? (
          <div className="ai-chat-summary-card__actions">
            <button type="button" className="button button--ghost button--tiny" onClick={onToggle}>
              {expanded ? 'Hide' : 'Show'}
            </button>
          </div>
        ) : null}
      </div>
      {locked ? <p className="ai-chat-summary-card__note">This chat is locked because at least one generated checklist item was already approved.</p> : null}
      {expanded ? (
        <div className="ai-chat-summary-card__grid">
          {rows.map((row) => (
            <article key={`${row.label}-${row.step}`} className="ai-chat-summary-card__item">
              <div className="ai-chat-summary-card__item-copy">
                <div className="ai-chat-summary-card__item-label">
                  <span>{row.label}</span>
                  {row.label === 'Batch' ? <span className="ai-chat-summary-card__mode-badge">{modeLabel}</span> : null}
                </div>
                {row.href ? (
                  <a href={row.href} target="_blank" rel="noreferrer noopener">
                    {row.value}
                  </a>
                ) : (
                  <strong>{row.value}</strong>
                )}
              </div>
              {!locked && onEditStep ? (
                <button type="button" className="pill-button" onClick={() => onEditStep(row.step)}>
                  Edit
                </button>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function AIChatConversation({
  thread,
  assistantName,
  emptyTitle,
  emptyMessage,
  transientDraft,
  pendingItemId,
  onReviewAction,
}: {
  thread: AIChatThread | null
  assistantName: string
  emptyTitle: string
  emptyMessage: string
  transientDraft?: AIChatTransientDraft | null
  pendingItemId?: number | null
  onReviewAction?: (item: AIGeneratedChecklistItem, action: 'approve' | 'reject') => void
}) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const messageCount = thread?.messages.length ?? 0

  useEffect(() => {
    const list = listRef.current
    if (!list) {
      return
    }
    list.scrollTop = list.scrollHeight
  }, [messageCount, transientDraft?.reasoningText, transientDraft?.phase, transientDraft?.stage])

  if (!thread?.messages.length && !transientDraft) {
    return (
      <div className="ai-chat-conversation__empty">
        <strong>{emptyTitle}</strong>
        <p>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div ref={listRef} className="ai-chat-conversation__list">
      {(thread?.messages ?? []).map((messageItem) => (
        <article key={`${messageItem.role}-${messageItem.id}`} className={`ai-chat-bubble-row ai-chat-bubble-row--${messageItem.role}`}>
          <div className={`ai-chat-bubble ai-chat-bubble--${messageItem.role}`}>
            <span className="ai-chat-bubble__author">
              {messageItem.role === 'assistant' ? assistantName : 'You'} | {formatChatTime(messageItem.created_at, messageItem.created_at_iso)}
            </span>
            {messageItem.attachments.length ? (
              <div className="ai-chat-attachment-list">
                {messageItem.attachments.map((attachment) => (
                  <a
                    key={`${attachment.original_name}-${attachment.id}`}
                    className="ai-chat-attachment"
                    href={attachment.file_path || '#'}
                    target={attachment.file_path ? '_blank' : undefined}
                    rel={attachment.file_path ? 'noreferrer noopener' : undefined}
                  >
                    <strong>{attachment.original_name}</strong>
                    <span>{formatFileSize(attachment.file_size)}</span>
                  </a>
                ))}
              </div>
            ) : null}
            {renderFormattedText(messageItem.content || (messageItem.status === 'streaming' ? 'Drafting checklist items...' : ' '), 'ai-chat-bubble__content', 'ai-chat-bubble__content-block')}
            {messageItem.error_message ? <small className="ai-chat-bubble__error">{messageItem.error_message}</small> : null}
            {messageItem.generated_checklist_items.length ? (
              <div className="ai-chat-generated-list">
                {messageItem.generated_checklist_items.map((item) => (
                  <article key={item.id} className={`ai-chat-generated-card is-${item.review_status}`}>
                    <div className="ai-chat-generated-card__header">
                      <div>
                        <strong>{item.title}</strong>
                        <span>
                          {item.module_name}
                          {item.submodule_name ? ` / ${item.submodule_name}` : ''}
                        </span>
                      </div>
                      <div className="ai-chat-generated-card__badges">
                        <span className="pill">{item.priority}</span>
                        <span className="pill">{item.required_role}</span>
                        <span className={`pill ai-chat-generated-card__duplicate pill--${duplicateTone(item.duplicate_status)}`}>
                          {item.duplicate_status.replaceAll('_', ' ')}
                        </span>
                      </div>
                    </div>
                    {item.description ? renderFormattedText(item.description, 'ai-chat-generated-card__description', 'ai-chat-generated-card__description-block') : null}
                    {item.duplicate_summary ? <small className="ai-chat-generated-card__summary">{item.duplicate_summary}</small> : null}
                    {item.duplicate_matches.length ? (
                      <div className="ai-chat-generated-card__matches">
                        {item.duplicate_matches.map((match) => (
                          <span key={match.id} className="pill">
                            #{match.id} {match.full_title}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="ai-chat-generated-card__actions">
                      {item.review_status === 'pending' && onReviewAction ? (
                        <>
                          <button
                            type="button"
                            className="button button--primary button--tiny"
                            disabled={pendingItemId === item.id}
                            onClick={() => onReviewAction(item, 'approve')}
                          >
                            {pendingItemId === item.id ? 'Saving...' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            className="button button--ghost button--tiny"
                            disabled={pendingItemId === item.id}
                            onClick={() => onReviewAction(item, 'reject')}
                          >
                            Reject
                          </button>
                        </>
                      ) : item.review_status === 'approved' ? (
                        <>
                          <span className="pill pill--success">Approved</span>
                          {item.approved_batch_id ? <Link className="inline-link" to={`/app/checklist/batches/${item.approved_batch_id}`}>Open batch</Link> : null}
                        </>
                      ) : (
                        <span className="pill">Rejected</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </article>
      ))}
      {transientDraft ? (
        <>
          <article className="ai-chat-bubble-row ai-chat-bubble-row--user">
            <div className="ai-chat-bubble ai-chat-bubble--user">
              <span className="ai-chat-bubble__author">You | just now</span>
              {transientDraft.attachments.length ? (
                <div className="ai-chat-attachment-list">
                  {transientDraft.attachments.map((attachment) => (
                    <span key={`${attachment.name}-${attachment.size}`} className="ai-chat-attachment">
                      <strong>{attachment.name}</strong>
                      <span>{formatFileSize(attachment.size)}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              <p>{transientDraft.userMessagePreview || (transientDraft.sourceMode === 'link' ? 'Draft a checklist from this page link.' : 'Draft a checklist from the uploaded screenshots and page link.')}</p>
            </div>
          </article>
          <article className="ai-chat-bubble-row ai-chat-bubble-row--assistant">
            <div className="ai-chat-bubble ai-chat-bubble--assistant ai-chat-bubble--live">
              <span className="ai-chat-bubble__author">{transientDraft.assistantName || assistantName} | live</span>
              <div className="ai-chat-live-status">
                <span className={`pill ai-chat-live-status__pill ai-chat-live-status__pill--${transientDraft.phase}`}>
                  {mapDraftStageLabel(transientDraft.sourceMode, transientDraft.stage)}
                </span>
                <span className="ai-chat-live-status__dot" aria-hidden="true" />
              </div>
              {transientDraft.reasoningText ? (
                renderFormattedText(transientDraft.reasoningText, 'ai-chat-live-reasoning', 'ai-chat-live-reasoning__block')
              ) : (
                <div className="ai-chat-live-reasoning ai-chat-live-reasoning--placeholder">
                  <span className="ai-chat-live-reasoning__shimmer" aria-hidden="true" />
                  <p>BugCatcher is working on your checklist draft...</p>
                </div>
              )}
              {transientDraft.errorMessage ? <small className="ai-chat-bubble__error">{transientDraft.errorMessage}</small> : null}
            </div>
          </article>
        </>
      ) : null}
    </div>
  )
}

function AIChatComposer({
  sourceMode,
  composer,
  attachments,
  pending,
  canSend,
  disabled,
  helperText,
  placeholder,
  onComposerChange,
  onAttachmentsChange,
  onSend,
}: {
  sourceMode: AIChatSourceMode
  composer: string
  attachments: File[]
  pending: boolean
  canSend: boolean
  disabled: boolean
  helperText: string
  placeholder: string
  onComposerChange: (value: string) => void
  onAttachmentsChange: (files: File[]) => void
  onSend: () => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const allowAttachments = sourceModeRequiresAttachments(sourceMode)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    textarea.style.height = '0px'
    const computed = window.getComputedStyle(textarea)
    const lineHeight = Number.parseFloat(computed.lineHeight || '22')
    const maxHeight = lineHeight * 4 + 18
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [composer])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (canSend) {
        onSend()
      }
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    onAttachmentsChange(Array.from(event.target.files ?? []))
  }

  return (
    <div className="ai-chat-compose">
      {attachments.length ? (
        <div className="ai-chat-selected-files">
          {attachments.map((file) => (
            <span key={`${file.name}-${file.size}`} className="pill">
              {file.name} | {formatFileSize(file.size)}
            </span>
          ))}
        </div>
      ) : null}
      <div className="ai-chat-compose__input">
        {allowAttachments ? (
          <button
          type="button"
          className="ai-chat-compose__media-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          aria-label="Add screenshots"
          title="Add screenshots"
        >
          <Icon name="spark" />
          <span aria-hidden="true">🖼️</span>
          </button>
        ) : null}
        <textarea
          ref={textareaRef}
          className="ai-chat-textarea"
          placeholder={placeholder}
          value={composer}
          rows={1}
          onChange={(event) => onComposerChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <button type="button" className="button button--primary ai-chat-send" disabled={!canSend} onClick={onSend}>
          {pending ? 'Drafting...' : 'Draft'}
        </button>
      </div>
      <p className="ai-chat-compose__note">{helperText}</p>
      {allowAttachments ? <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={handleFileChange} /> : null}
    </div>
  )
}

function AIChatLandingView({
  bootstrap,
  accessToken,
  activeOrgId,
}: {
  bootstrap: AIChatBootstrap
  accessToken: string
  activeOrgId: number
}) {
  const navigate = useNavigate()
  const { openDrawer } = useOutletContext<AppShellOutletContext>()
  const [threads, setThreads] = useState<AIChatThreadSummary[]>([])
  const [threadDetails, setThreadDetails] = useState<Record<number, AIChatThread>>({})
  const [sourceChooserOpen, setSourceChooserOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const deferredSearch = useDeferredValue(searchValue.trim().toLowerCase())

  useEffect(() => {
    let ignore = false

    const run = async () => {
      setLoading(true)
      try {
        const result = await fetchAIChatThreads(accessToken, activeOrgId)
        if (!ignore) {
          setThreads(sortThreads(result.threads))
          setError('')
        }
      } catch (loadError) {
        if (!ignore) {
          setError(getErrorMessage(loadError, 'Unable to load AI chat history.'))
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId])

  useEffect(() => {
    if (!threads.length) {
      return
    }

    const threadIdsToLoad = threads.map((thread) => thread.id).filter((threadId) => !threadDetails[threadId])
    if (!threadIdsToLoad.length) {
      return
    }

    let ignore = false

    const run = async () => {
      const results = await Promise.allSettled(threadIdsToLoad.map((threadId) => fetchAIChatThread(accessToken, activeOrgId, threadId)))
      if (ignore) {
        return
      }

      setThreadDetails((current) => {
        const next = { ...current }
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            next[threadIdsToLoad[index]] = result.value.thread
          }
        })
        return next
      })
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId, threadDetails, threads])

  const projectOptions = useMemo(() => {
    const projectMap = new Map<number, string>()
    threads.forEach((thread) => {
      if (thread.draft_context.project_id > 0) {
        projectMap.set(thread.draft_context.project_id, thread.draft_context.project_name || 'Unnamed project')
      }
    })

    return Array.from(projectMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name))
  }, [threads])

  const visibleThreads = useMemo(() => {
    return threads.filter((thread) => {
      const matchesProject = projectFilter === 'all' || `${thread.draft_context.project_id}` === projectFilter
      const matchesSearch = !deferredSearch || buildThreadSearchText(thread).includes(deferredSearch)
      return matchesProject && matchesSearch
    })
  }, [deferredSearch, projectFilter, threads])

  const handleDeleteThread = async (threadId: number) => {
    if (!window.confirm('Delete this checklist draft chat?')) {
      return
    }

    setError('')
    setMessage('')

    try {
      await deleteAIChatThread(accessToken, activeOrgId, threadId)
      setThreads((current) => current.filter((thread) => thread.id !== threadId))
      setThreadDetails((current) => {
        const next = { ...current }
        delete next[threadId]
        return next
      })
      setMessage('Chat deleted.')
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete the AI chat thread.'))
    }
  }

  return (
    <div className="ai-chat-page">
      <AIChatHeader
        title={bootstrap.assistant_name || 'BugCatcher AI'}
        subtitle="Browse old chats or start a new 5-step draft flow"
        leading={
          <button type="button" className="icon-button" aria-label="Open navigation drawer" onClick={openDrawer}>
            <Icon name="more" />
          </button>
        }
        actions={
          <>
            <ThemeToggle />
            <button type="button" className="button button--primary button--tiny" onClick={() => setSourceChooserOpen(true)}>
              New chat
            </button>
          </>
        }
      />

      <div className="ai-chat-page__body">
        {message ? <FormMessage tone="success">{message}</FormMessage> : null}
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}

        <section className="ai-chat-toolbar-card">
          <label className="ai-chat-search-field">
            <span className="ai-chat-search-field__icon" aria-hidden="true">
              <Icon name="search" />
            </span>
            <input
              className="input-inline ai-chat-search-field__input"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search by title, project, batch, or module"
            />
          </label>
          <select className="select-inline ai-chat-toolbar-card__filter" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="all">All projects</option>
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </section>

        {loading ? (
          <section className="ai-chat-state-card">
            <p className="body-copy">Loading chat history...</p>
          </section>
        ) : visibleThreads.length ? (
          <div className="ai-chat-history-list">
            {visibleThreads.map((thread) => (
              <AIChatHistoryCard
                key={thread.id}
                summary={thread}
                detail={threadDetails[thread.id]}
                onOpen={() => navigate(`/app/ai-chat/threads/${thread.id}`)}
                onDelete={() => void handleDeleteThread(thread.id)}
              />
            ))}
          </div>
        ) : (
          <section className="ai-chat-state-card">
            <strong>{threads.length ? 'No chats match that search yet' : 'No AI chats yet'}</strong>
            <p>{threads.length ? 'Try another keyword or reset the project filter.' : 'Start your first AI checklist draft from the New chat button.'}</p>
          </section>
        )}
      </div>
      <AIChatSourceChooser
        bootstrap={bootstrap}
        open={sourceChooserOpen}
        onClose={() => setSourceChooserOpen(false)}
        onSelect={(sourceMode) => {
          setSourceChooserOpen(false)
          navigate(buildNewChatRoute(sourceMode))
        }}
      />
    </div>
  )
}

function AIChatCreateView({
  bootstrap,
  accessToken,
  activeOrgId,
}: {
  bootstrap: AIChatBootstrap
  accessToken: string
  activeOrgId: number
}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editThreadId = normalizePositiveInt(searchParams.get('threadId'))
  const querySourceMode = normalizeSourceMode(searchParams.get('source'), 'screenshot')
  const queryStep = clampStep(normalizePositiveInt(searchParams.get('step')) ?? 1)
  const initialSourceMode = getSourceModeAvailability(bootstrap, querySourceMode).enabled
    ? querySourceMode
    : getSourceModeAvailability(bootstrap, 'link').enabled
      ? 'link'
      : 'screenshot'
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [availableBatches, setAvailableBatches] = useState<ChecklistBatch[]>([])
  const [editingThread, setEditingThread] = useState<AIChatThread | null>(null)
  const [draftForm, setDraftForm] = useState<DraftFormState>(() => createEmptyDraftForm(initialSourceMode))
  const [step, setStep] = useState<FlowStep>(queryStep)
  const [composer, setComposer] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [summaryExpanded, setSummaryExpanded] = useState(true)
  const [sourceChooserOpen, setSourceChooserOpen] = useState(false)
  const [pageLinkPreview, setPageLinkPreview] = useState<AIChatPageLinkPreview | null>(null)
  const [previewPending, setPreviewPending] = useState(false)
  const [basicAuthUsername, setBasicAuthUsername] = useState('')
  const [basicAuthPassword, setBasicAuthPassword] = useState('')
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [loadingThread, setLoadingThread] = useState(Boolean(editThreadId))
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const draftInFlightRef = useRef(false)

  const selectedProject = useMemo(() => projects.find((project) => project.id === draftForm.projectId) ?? null, [draftForm.projectId, projects])
  const selectedExistingBatch = useMemo(
    () => availableBatches.find((batch) => batch.id === draftForm.existingBatchId) ?? null,
    [availableBatches, draftForm.existingBatchId],
  )
  const summary = useMemo(
    () => buildSummaryRows(draftForm, projects, selectedExistingBatch, editingThread?.draft_context),
    [draftForm, editingThread?.draft_context, projects, selectedExistingBatch],
  )
  const contextLocked = Boolean(editingThread?.draft_context.is_locked)
  const contextChanged = Boolean(editingThread && !formMatchesContext(draftForm, editingThread.draft_context))
  const sourceAvailability = getSourceModeAvailability(bootstrap, draftForm.sourceMode)
  const canSend = Boolean(
    bootstrap.enabled &&
    sourceAvailability.enabled &&
    !pending &&
    (!sourceModeRequiresAttachments(draftForm.sourceMode) || attachments.length > 0),
  )

  useEffect(() => {
    let ignore = false

    const run = async () => {
      setLoadingProjects(true)
      try {
        const result = await fetchProjects(accessToken, activeOrgId, 'active')
        if (!ignore) {
          setProjects(result.projects)
        }
      } catch (loadError) {
        if (!ignore) {
          setError(getErrorMessage(loadError, 'Unable to load projects for checklist drafting.'))
        }
      } finally {
        if (!ignore) {
          setLoadingProjects(false)
        }
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId])

  useEffect(() => {
    if (!editThreadId) {
      setLoadingThread(false)
      setEditingThread(null)
      setStep(queryStep)
      return
    }

    let ignore = false

    const run = async () => {
      setLoadingThread(true)
      try {
        const result = await fetchAIChatThread(accessToken, activeOrgId, editThreadId)
        if (ignore) {
          return
        }

        if (result.thread.draft_context.is_locked) {
          navigate(`/app/ai-chat/threads/${editThreadId}`, { replace: true })
          return
        }

        setEditingThread(result.thread)
        setDraftForm(draftContextToForm(result.thread.draft_context))
        setPageLinkPreview(previewFromDraftContext(result.thread.draft_context))
        setStep(queryStep)
        setError('')
      } catch (loadError) {
        if (!ignore) {
          setError(getErrorMessage(loadError, 'Unable to load the selected AI chat thread.'))
        }
      } finally {
        if (!ignore) {
          setLoadingThread(false)
        }
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId, editThreadId, navigate, queryStep])

  useEffect(() => {
    if (editThreadId) {
      return
    }

    setStep(queryStep)
    setDraftForm((current) => {
      if (current.sourceMode === initialSourceMode) {
        return current
      }
      return { ...current, sourceMode: initialSourceMode }
    })
  }, [editThreadId, initialSourceMode, queryStep])

  useEffect(() => {
    if (draftForm.projectId <= 0) {
      setAvailableBatches([])
      setLoadingBatches(false)
      return
    }

    let ignore = false

    const run = async () => {
      setLoadingBatches(true)
      try {
        const result = await fetchChecklistBatches(accessToken, activeOrgId, { projectId: draftForm.projectId })
        if (!ignore) {
          setAvailableBatches(result.batches)
          setError('')
        }
      } catch (loadError) {
        if (!ignore) {
          setError(getErrorMessage(loadError, 'Unable to load checklist batches for the selected project.'))
        }
      } finally {
        if (!ignore) {
          setLoadingBatches(false)
        }
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId, draftForm.projectId])

  useEffect(() => {
    if (draftForm.sourceMode !== 'link' || !attachments.length) {
      return
    }
    setAttachments([])
  }, [attachments.length, draftForm.sourceMode])

  useEffect(() => {
    if (draftForm.targetMode !== 'existing' || !selectedExistingBatch?.page_url || draftForm.pageUrl.trim()) {
      return
    }

    setDraftForm((current) => {
      if (current.targetMode !== 'existing' || current.pageUrl.trim()) {
        return current
      }
      return { ...current, pageUrl: selectedExistingBatch.page_url || '' }
    })
  }, [draftForm.pageUrl, draftForm.targetMode, selectedExistingBatch?.page_url])

  useEffect(() => {
    const contextPreview = previewFromDraftContext(editingThread?.draft_context)
    if (!contextPreview || contextPreview.page_url !== draftForm.pageUrl.trim()) {
      return
    }
    setPageLinkPreview(contextPreview)
  }, [
    draftForm.pageUrl,
    editingThread?.draft_context.has_saved_link_credentials,
    editingThread?.draft_context.page_link_status,
    editingThread?.draft_context.page_link_warning,
    editingThread?.draft_context.page_url,
  ])

  useEffect(() => {
    if (!pageLinkPreview || pageLinkPreview.page_url === draftForm.pageUrl.trim()) {
      return
    }
    setPageLinkPreview(null)
  }, [draftForm.pageUrl, pageLinkPreview])

  const handleBack = () => {
    if (step === 1) {
      navigate(editThreadId ? `/app/ai-chat/threads/${editThreadId}` : '/app/ai-chat')
      return
    }
    setStep((current) => clampStep(current - 1))
  }

  const validateStep = (currentStep: FlowStep) => {
    if (!sourceAvailability.enabled) {
      return sourceAvailability.warning || 'This source mode is not currently available.'
    }
    if (currentStep === 1 && !isValidPageUrl(draftForm.pageUrl.trim())) {
      return 'Enter a valid page link before continuing.'
    }
    if (currentStep === 2 && draftForm.projectId <= 0) {
      return 'Select a project before continuing.'
    }
    if (currentStep === 3) {
      if (draftForm.targetMode === 'existing' && draftForm.existingBatchId <= 0) {
        return loadingBatches ? 'Wait until checklist batches finish loading.' : 'Select an existing batch or choose New batch.'
      }
      if (draftForm.targetMode === 'new' && !draftForm.batchTitle.trim()) {
        return 'Enter a batch title before continuing.'
      }
    }
    if (currentStep === 4 && draftForm.targetMode === 'new' && !draftForm.moduleName.trim()) {
      return 'Enter a module name before continuing.'
    }
    return ''
  }

  const handleSelectSourceMode = (sourceMode: AIChatSourceMode) => {
    const nextAvailability = getSourceModeAvailability(bootstrap, sourceMode)
    if (!nextAvailability.enabled) {
      setError(nextAvailability.warning || 'This source mode is not available right now.')
      return
    }
    if (
      sourceMode === 'link' &&
      draftForm.sourceMode !== 'link' &&
      attachments.length > 0 &&
      !window.confirm('Switching to Via link will clear the uploaded screenshots for this draft. Continue?')
    ) {
      return
    }

    setDraftForm((current) => ({ ...current, sourceMode }))
    if (sourceMode === 'link') {
      setAttachments([])
    }
    setSourceChooserOpen(false)
    setError('')
  }

  const ensureThread = async () => {
    if (editingThread) {
      return { threadId: editingThread.id, thread: editingThread }
    }

    const result = await createAIChatThread(accessToken, activeOrgId, buildThreadTitle(draftForm, selectedProject, selectedExistingBatch))
    setEditingThread(result.thread)
    return { threadId: result.thread.id, thread: result.thread }
  }

  const syncThreadContext = async () => {
    const payload = buildDraftPayload(draftForm)
    const { threadId, thread } = await ensureThread()

    if (formMatchesContext(draftForm, thread.draft_context)) {
      const existingPreview = previewFromDraftContext(thread.draft_context)
      if (existingPreview && existingPreview.page_url === payload.page_url) {
        setPageLinkPreview(existingPreview)
      }
      return { threadId, thread }
    }

    const result = await updateAIChatDraftContext(accessToken, activeOrgId, threadId, payload)
    setEditingThread(result.thread)
    const syncedPreview = previewFromDraftContext(result.thread.draft_context)
    if (syncedPreview && syncedPreview.page_url === payload.page_url) {
      setPageLinkPreview(syncedPreview)
    }
    return { threadId, thread: result.thread }
  }

  const ensurePageLinkPreview = async () => {
    const trimmedPageUrl = draftForm.pageUrl.trim()
    if (!isValidPageUrl(trimmedPageUrl)) {
      setError('Enter a valid page link before continuing.')
      return null
    }
    if (!sourceAvailability.enabled) {
      setError(sourceAvailability.warning || 'This source mode is not currently available.')
      return null
    }

    setPreviewPending(true)
    setError('')

    try {
      const { threadId } = await ensureThread()
      const result = await previewAIChatPageLink(accessToken, activeOrgId, threadId, {
        page_url: trimmedPageUrl,
        basic_auth_username: basicAuthUsername.trim() || undefined,
        basic_auth_password: basicAuthPassword || undefined,
      })
      setEditingThread(result.thread)
      setPageLinkPreview(result.page_link_preview)
      return result.page_link_preview
    } catch (previewError) {
      setError(getErrorMessage(previewError, 'Unable to validate this page link right now.'))
      return null
    } finally {
      setPreviewPending(false)
    }
  }

  const handleNext = async () => {
    const validationError = validateStep(step)
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      if (step === 1) {
        const preview = await ensurePageLinkPreview()
        if (!preview) {
          return
        }
        if (!isPreviewAcceptedForLink(preview.status)) {
          setError(preview.warning_message || 'Fix the page link before continuing.')
          return
        }
      } else if (step === 4) {
        await syncThreadContext()
      }

      setError('')
      setSummaryExpanded(true)
      setStep((current) => clampStep(current + 1))
    } catch (stepError) {
      setError(getErrorMessage(stepError, 'Unable to save the draft target right now.'))
    }
  }

  const handleEditStep = (targetStep: Exclude<FlowStep, 5>) => {
    if (!contextLocked) {
      setStep(targetStep)
    }
  }

  const handleSend = async () => {
    if (draftInFlightRef.current) {
      return
    }

    const validationError = validateStep(1) || validateStep(2) || validateStep(3) || validateStep(4)
    if (validationError) {
      setError(validationError)
      return
    }

    let preview = pageLinkPreview && pageLinkPreview.page_url === draftForm.pageUrl.trim() ? pageLinkPreview : null
    if (!preview || !isPreviewAcceptedForLink(preview.status)) {
      preview = await ensurePageLinkPreview()
    }
    if (!preview || !isPreviewAcceptedForLink(preview.status)) {
      setError(preview?.warning_message || 'Validate the page link before drafting checklist items.')
      return
    }
    if (sourceModeRequiresAttachments(draftForm.sourceMode) && !attachments.length) {
      setError('Upload at least one image before generating checklist draft items.')
      return
    }

    draftInFlightRef.current = true
    setPending(true)
    setError('')

    try {
      const clientRequestId = createClientRequestId()
      const { threadId } = await syncThreadContext()
      const startDraft: ThreadRouteDraftStart = {
        threadId,
        clientRequestId,
        message: composer.trim(),
        attachments: [...attachments],
        sourceMode: draftForm.sourceMode,
      }
      navigate(`/app/ai-chat/threads/${threadId}`, { replace: true, state: { startDraft } })
    } catch (sendError) {
      setError(
        getErrorMessage(
          sendError,
          draftForm.sourceMode === 'link'
            ? 'Unable to draft checklist items from the saved page link.'
            : 'Unable to draft checklist items from the uploaded screenshots and page link.',
        ),
      )
    } finally {
      draftInFlightRef.current = false
      setPending(false)
    }
  }

  const existingModuleName = selectedExistingBatch?.module_name || editingThread?.draft_context.module_name || ''
  const existingSubmoduleName = selectedExistingBatch?.submodule_name || editingThread?.draft_context.submodule_name || ''

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <section className="ai-chat-flow-card">
            <div className="ai-chat-flow-card__header">
              <h2>Page link</h2>
              <p>Paste the exact page BugCatcher should connect to this checklist draft.</p>
            </div>
            <div className="ai-chat-source-banner">
              <div className="ai-chat-source-banner__copy">
                <span className="pill ai-chat-source-pill">{sourceModeLabel(draftForm.sourceMode)}</span>
                <small>
                  {draftForm.sourceMode === 'link'
                    ? 'BugCatcher will analyze this page link directly. Screenshots are not required.'
                    : 'BugCatcher will use this page link together with your uploaded screenshots in chat.'}
                </small>
              </div>
              <button type="button" className="button button--ghost button--tiny" onClick={() => setSourceChooserOpen(true)}>
                Change source
              </button>
            </div>
            {!sourceAvailability.enabled && sourceAvailability.warning ? <FormMessage tone="error">{sourceAvailability.warning}</FormMessage> : null}
            <div className="inline-form ai-chat-link-step__inputs">
              <input
                className="input-inline"
                value={draftForm.pageUrl}
                onChange={(event) => {
                  setDraftForm((current) => ({ ...current, pageUrl: event.target.value }))
                  setError('')
                }}
                placeholder="https://..."
                inputMode="url"
              />
              <button type="button" className="button button--ghost" onClick={() => void ensurePageLinkPreview()} disabled={previewPending || !draftForm.pageUrl.trim()}>
                {previewPending ? 'Checking...' : 'Check link'}
              </button>
            </div>
            {pageLinkPreview ? (
              <div className={`ai-chat-link-preview ai-chat-link-preview--${previewTone(pageLinkPreview.status)}`}>
                <div className="ai-chat-link-preview__top">
                  <strong>{formatPreviewStatusLabel(pageLinkPreview.status)}</strong>
                  {pageLinkPreview.page_title ? <span>{pageLinkPreview.page_title}</span> : null}
                </div>
                {pageLinkPreview.warning_message ? <p>{pageLinkPreview.warning_message}</p> : null}
                {pageLinkPreview.excerpt ? <p className="ai-chat-link-preview__excerpt">{pageLinkPreview.excerpt}</p> : null}
              </div>
            ) : (
              <div className="ai-chat-inline-note ai-chat-inline-note--info">
                Check the link now so BugCatcher can detect auth walls before you finish the draft setup.
              </div>
            )}
            {pageLinkPreview?.status === 'auth_required_basic' ? (
              <div className="ai-chat-link-auth">
                <div className="ai-chat-link-auth__copy">
                  <strong>HTTP Basic Auth required</strong>
                  <p>Enter the credentials for this page, then check the link again.</p>
                </div>
                <div className="inline-form">
                  <input
                    className="input-inline"
                    value={basicAuthUsername}
                    onChange={(event) => setBasicAuthUsername(event.target.value)}
                    placeholder="Username"
                    autoComplete="username"
                  />
                  <input
                    className="input-inline"
                    value={basicAuthPassword}
                    onChange={(event) => setBasicAuthPassword(event.target.value)}
                    placeholder="Password"
                    type="password"
                    autoComplete="current-password"
                  />
                </div>
                {pageLinkPreview.credentials_saved ? <small>Saved credentials were found for this thread. Leave the password blank to reuse them.</small> : null}
              </div>
            ) : null}
            {editingThread?.draft_context.page_link_warning ? <FormMessage tone="info">{editingThread.draft_context.page_link_warning}</FormMessage> : null}
          </section>
        )
      case 2:
        return (
          <section className="ai-chat-flow-card">
            <div className="ai-chat-flow-card__header">
              <h2>Select project</h2>
              <p>Choose where the generated checklist cards will belong.</p>
            </div>
            <div className="ai-chat-choice-list">
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={`ai-chat-choice-card ${draftForm.projectId === project.id ? 'is-selected' : ''}`}
                  onClick={() => {
                    setDraftForm((current) => ({ ...current, projectId: project.id, existingBatchId: current.projectId === project.id ? current.existingBatchId : 0 }))
                    setError('')
                  }}
                >
                  <span className="icon-wrap">
                    <Icon name="projects" />
                  </span>
                  <span className="ai-chat-choice-card__copy">
                    <strong>{project.name}</strong>
                    <small>{project.org_name || 'Active project'}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )
      case 3:
        return (
          <section className="ai-chat-flow-card">
            <div className="ai-chat-flow-card__header">
              <h2>Batch</h2>
              <p>Choose whether this draft should create a new batch or insert cards into an existing one.</p>
            </div>
            <div className="ai-chat-choice-list">
              <button
                type="button"
                className={`ai-chat-choice-card ${draftForm.targetMode === 'new' ? 'is-selected' : ''}`}
                onClick={() => {
                  setDraftForm((current) => ({ ...current, targetMode: 'new', existingBatchId: 0 }))
                  setError('')
                }}
              >
                <span className="icon-wrap">
                  <Icon name="checklist" />
                </span>
                <span className="ai-chat-choice-card__copy">
                  <strong>New batch</strong>
                  <small>Create a brand new checklist batch for this target.</small>
                </span>
              </button>
              {loadingBatches ? <div className="ai-chat-inline-note">Loading checklist batches for this project...</div> : null}
              {availableBatches.map((batch) => (
                <button
                  key={batch.id}
                  type="button"
                  className={`ai-chat-choice-card ${draftForm.targetMode === 'existing' && draftForm.existingBatchId === batch.id ? 'is-selected' : ''}`}
                  onClick={() => {
                    setDraftForm((current) => ({
                      ...current,
                      targetMode: 'existing',
                      existingBatchId: batch.id,
                      pageUrl:
                        current.targetMode === 'existing' && current.existingBatchId === batch.id
                          ? current.pageUrl
                          : batch.page_url || current.pageUrl,
                    }))
                    setError('')
                  }}
                >
                  <span className="icon-wrap">
                    <Icon name="organization" />
                  </span>
                  <span className="ai-chat-choice-card__copy">
                    <strong>{batch.title}</strong>
                    <small>
                      {batch.module_name}
                      {batch.submodule_name ? ` / ${batch.submodule_name}` : ''}
                    </small>
                  </span>
                </button>
              ))}
              {!loadingBatches && draftForm.projectId > 0 && availableBatches.length === 0 ? (
                <div className="ai-chat-inline-note">No existing checklist batches were found for this project yet.</div>
              ) : null}
            </div>
            {draftForm.targetMode === 'new' ? (
              <div className="inline-form">
                <input className="input-inline" value={draftForm.batchTitle} onChange={(event) => setDraftForm((current) => ({ ...current, batchTitle: event.target.value }))} placeholder="Batch title" />
              </div>
            ) : (
              <p className="body-copy">Existing batch mode will reuse the selected batch details in steps 3 and 4.</p>
            )}
            {editingThread?.draft_context.page_link_warning ? <FormMessage tone="info">{editingThread.draft_context.page_link_warning}</FormMessage> : null}
          </section>
        )
      case 4:
        return (
          <section className="ai-chat-flow-card">
            <div className="ai-chat-flow-card__header">
              <h2>Module</h2>
              <p>Confirm the module and optional submodule that this checklist draft belongs to.</p>
            </div>
            {draftForm.targetMode === 'new' ? (
              <div className="inline-form">
                <input className="input-inline" value={draftForm.moduleName} onChange={(event) => setDraftForm((current) => ({ ...current, moduleName: event.target.value }))} placeholder="Module name" />
                <input className="input-inline" value={draftForm.submoduleName} onChange={(event) => setDraftForm((current) => ({ ...current, submoduleName: event.target.value }))} placeholder="Submodule name (optional)" />
              </div>
            ) : (
              <div className="ai-chat-readonly-stack">
                <div className="ai-chat-readonly-card">
                  <span>Module</span>
                  <strong>{existingModuleName || 'No module stored for this batch yet'}</strong>
                </div>
                <div className="ai-chat-readonly-card">
                  <span>Submodule</span>
                  <strong>{existingSubmoduleName || 'No submodule saved'}</strong>
                </div>
              </div>
            )}
            <div className="ai-chat-inline-note ai-chat-inline-note--info">
              Approved checklist items will keep the page link from step 1 for future QA testing.
            </div>
          </section>
        )
      case 5:
        return (
          <div className="ai-chat-thread-stage">
            {contextChanged ? <FormMessage tone="info">Your edited target summary will be saved with the next draft request.</FormMessage> : null}
            {editingThread?.draft_context.page_link_warning ? <FormMessage tone="info">{editingThread.draft_context.page_link_warning}</FormMessage> : null}
            <AIChatSummaryCard modeLabel={summary.modeLabel} rows={summary.rows} expanded={summaryExpanded} locked={contextLocked} onToggle={() => setSummaryExpanded((current) => !current)} onEditStep={handleEditStep} />
            {editingThread?.messages.length ? (
              <section className="ai-chat-thread-stage__conversation">
                <AIChatConversation thread={editingThread} assistantName={bootstrap.assistant_name || 'BugCatcher AI'} emptyTitle="" emptyMessage="" />
              </section>
            ) : null}
            <AIChatComposer
              sourceMode={draftForm.sourceMode}
              composer={composer}
              attachments={attachments}
              pending={pending}
              canSend={canSend}
              disabled={pending}
              helperText={sourceModeComposerHelperText(draftForm.sourceMode, true)}
              placeholder={sourceModeComposerPlaceholder(draftForm.sourceMode)}
              onComposerChange={setComposer}
              onAttachmentsChange={setAttachments}
              onSend={() => void handleSend()}
            />
          </div>
        )
    }
  }

  return (
    <div className="ai-chat-page">
      <AIChatHeader
        title={editThreadId ? 'Edit chat target' : 'New chat'}
        subtitle={step === 5 ? 'Review your summary and start drafting' : `Step ${step} of 5`}
        leading={<button type="button" className="icon-button ai-chat-back-button" aria-label="Go back" onClick={handleBack}><Icon name="arrow" /></button>}
        actions={<ThemeToggle />}
      />
      <div className="ai-chat-page__body">
        <AIChatProgress currentStep={step} />
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        {loadingProjects || loadingThread ? (
          <section className="ai-chat-state-card">
            <p className="body-copy">Loading create chat flow...</p>
          </section>
        ) : (
          <>
            {renderStep()}
            {step < 5 ? (
              <div className="ai-chat-flow__footer">
                <button type="button" className="button button--ghost" onClick={handleBack}>
                  {step === 1 ? 'Back to history' : 'Back'}
                </button>
                <button type="button" className="button button--primary" onClick={() => void handleNext()} disabled={previewPending}>
                  {step === 4 ? 'Continue to chat' : 'Next'}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
      <AIChatSourceChooser
        bootstrap={bootstrap}
        open={sourceChooserOpen}
        onClose={() => setSourceChooserOpen(false)}
        onSelect={handleSelectSourceMode}
      />
    </div>
  )
}

function AIChatThreadView({
  bootstrap,
  accessToken,
  activeOrgId,
}: {
  bootstrap: AIChatBootstrap
  accessToken: string
  activeOrgId: number
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { threadId } = useParams()
  const activeThreadId = normalizePositiveInt(threadId ?? null)
  const [threads, setThreads] = useState<AIChatThreadSummary[]>([])
  const [activeThread, setActiveThread] = useState<AIChatThread | null>(null)
  const [composer, setComposer] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [sourceChooserOpen, setSourceChooserOpen] = useState(false)
  const [activeThreadTab, setActiveThreadTab] = useState<ThreadViewTab>('chat')
  const [railOpen, setRailOpen] = useState(false)
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingThread, setLoadingThread] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [pendingItemId, setPendingItemId] = useState<number | null>(null)
  const [transientDraft, setTransientDraft] = useState<AIChatTransientDraft | null>(null)
  const draftInFlightRef = useRef(false)
  const streamAbortRef = useRef<AbortController | null>(null)
  const consumedRouteDraftRef = useRef('')

  useEffect(() => {
    let ignore = false

    const run = async () => {
      setLoadingThreads(true)
      try {
        const result = await fetchAIChatThreads(accessToken, activeOrgId)
        if (!ignore) {
          setThreads(sortThreads(result.threads))
        }
      } catch (loadError) {
        if (!ignore) {
          setError(getErrorMessage(loadError, 'Unable to load AI chat history.'))
        }
      } finally {
        if (!ignore) {
          setLoadingThreads(false)
        }
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId])

  useEffect(() => {
    if (!activeThreadId) {
      setLoadingThread(false)
      setActiveThread(null)
      setError('AI chat thread not found.')
      return
    }

    let ignore = false

    const run = async () => {
      setLoadingThread(true)
      try {
        const result = await fetchAIChatThread(accessToken, activeOrgId, activeThreadId)
        if (!ignore) {
          setActiveThread(result.thread)
          setError('')
        }
      } catch (loadError) {
        if (!ignore) {
          setError(getErrorMessage(loadError, 'Unable to load AI chat thread.'))
          setActiveThread(null)
        }
      } finally {
        if (!ignore) {
          setLoadingThread(false)
        }
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId, activeThreadId])

  useEffect(() => {
    setActiveThreadTab('chat')
  }, [activeThreadId])

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort()
    }
  }, [])

  const activeSourceMode = normalizeSourceMode(activeThread?.draft_context.source_mode, 'screenshot')
  const requiresAttachments = sourceModeRequiresAttachments(activeSourceMode)
  const summary = useMemo(() => buildSummaryRows(draftContextToForm(activeThread?.draft_context), [], null, activeThread?.draft_context), [activeThread?.draft_context])
  const canSend = Boolean(
    bootstrap.enabled &&
    activeThread?.draft_context.is_ready &&
    !pending &&
    (!requiresAttachments || attachments.length > 0),
  )

  useEffect(() => {
    if (requiresAttachments || !attachments.length) {
      return
    }
    setAttachments([])
  }, [attachments.length, requiresAttachments])

  const refreshThreads = async () => {
    const result = await fetchAIChatThreads(accessToken, activeOrgId)
    setThreads(sortThreads(result.threads))
  }

  const startDraftRun = async (draftRequest: {
    message: string
    attachments: File[]
    sourceMode: AIChatSourceMode
    clientRequestId?: string
  }) => {
    if (!activeThreadId || !activeThread?.draft_context.is_ready) {
      setError('Edit the checklist target before drafting more items.')
      return
    }
    if (draftInFlightRef.current) {
      return
    }
    if (sourceModeRequiresAttachments(draftRequest.sourceMode) && !draftRequest.attachments.length) {
      setError('Upload at least one image before generating checklist draft items.')
      return
    }

    const clientRequestId = draftRequest.clientRequestId || createClientRequestId()
    const assistantName = bootstrap.assistant_name || 'BugCatcher AI'
    draftInFlightRef.current = true
    setPending(true)
    setError('')
    setMessage('')
    setActiveThreadTab('chat')
    setTransientDraft({
      requestId: clientRequestId,
      threadId: activeThreadId,
      sourceMode: draftRequest.sourceMode,
      userMessagePreview: draftRequest.message.trim(),
      attachments: [...draftRequest.attachments],
      reasoningText: '',
      phase: 'preparing',
      stage: 'preparing',
      assistantName,
    })

    const controller = new AbortController()
    streamAbortRef.current = controller
    let completedThread: AIChatThread | null = null
    let streamErrorMessage = ''

    try {
      await streamChecklistDraft(
        accessToken,
        activeOrgId,
        activeThreadId,
        {
          message: draftRequest.message.trim(),
          attachments: draftRequest.attachments,
          client_request_id: clientRequestId,
        },
        {
          signal: controller.signal,
          onEvent: (event: AIChatDraftStreamEvent) => {
            switch (event.event) {
              case 'start':
                setTransientDraft((current) => (current && current.requestId === clientRequestId
                  ? {
                      ...current,
                      phase: 'streaming',
                      stage: 'preparing',
                      assistantMessageId: event.assistant_message_id,
                      userMessageId: event.user_message_id,
                      assistantName: event.assistant_name || assistantName,
                    }
                  : current))
                break
              case 'stage':
                setTransientDraft((current) => (current && current.requestId === clientRequestId
                  ? {
                      ...current,
                      phase: event.stage === 'reviewing' ? 'reviewing' : event.stage === 'finalizing' ? 'reconciling' : 'streaming',
                      stage: event.stage,
                    }
                  : current))
                break
              case 'reasoning_delta':
                setTransientDraft((current) => (current && current.requestId === clientRequestId
                  ? {
                      ...current,
                      phase: 'streaming',
                      reasoningText: `${current.reasoningText}${event.delta}`,
                    }
                  : current))
                break
              case 'done':
                completedThread = event.thread ?? null
                setTransientDraft((current) => (current && current.requestId === clientRequestId
                  ? {
                      ...current,
                      phase: 'reconciling',
                    }
                  : current))
                break
              case 'error':
                streamErrorMessage = event.message || 'AI chat could not complete the reply. Please try again.'
                if (event.thread) {
                  completedThread = event.thread
                }
                setTransientDraft((current) => (current && current.requestId === clientRequestId
                  ? {
                      ...current,
                      phase: 'error',
                      errorMessage: event.message || 'AI chat could not complete the reply. Please try again.',
                    }
                  : current))
                break
            }
          },
        },
      )

      if (streamErrorMessage) {
        if (completedThread) {
          setActiveThread(completedThread)
          await refreshThreads()
        }
        setError(streamErrorMessage)
        return
      }

      const finalThread = completedThread ?? (await fetchAIChatThread(accessToken, activeOrgId, activeThreadId)).thread
      setActiveThread(finalThread)
      setComposer('')
      setAttachments([])
      await refreshThreads()
      setTransientDraft(null)
    } catch (sendError) {
      if ((sendError as Error).name === 'AbortError') {
        return
      }
      setTransientDraft((current) => current
        ? {
            ...current,
            phase: 'error',
            errorMessage: getErrorMessage(sendError, 'AI chat could not complete the reply. Please try again.'),
          }
        : current)
      setError(
        getErrorMessage(
          sendError,
          draftRequest.sourceMode === 'link'
            ? 'Unable to draft checklist items from the saved page link.'
            : 'Unable to draft checklist items from the uploaded screenshots and page link.',
        ),
      )
    } finally {
      draftInFlightRef.current = false
      streamAbortRef.current = null
      setPending(false)
    }
  }

  const handleDeleteThread = async (threadIdToDelete: number) => {
    if (!window.confirm('Delete this checklist draft chat?')) {
      return
    }

    setError('')
    setMessage('')

    try {
      await deleteAIChatThread(accessToken, activeOrgId, threadIdToDelete)
      const remainingThreads = threads.filter((thread) => thread.id !== threadIdToDelete)
      setThreads(remainingThreads)

      if (threadIdToDelete === activeThreadId) {
        navigate('/app/ai-chat', { replace: true })
        return
      }

      setMessage('Chat deleted.')
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete the AI chat thread.'))
    }
  }

  const handleSend = async () => {
    await startDraftRun({
      message: composer,
      attachments,
      sourceMode: activeSourceMode,
    })
  }

  useEffect(() => {
    const routeState = (location.state as { startDraft?: ThreadRouteDraftStart } | null) ?? null
    const routeDraft = routeState?.startDraft
    if (!routeDraft || !activeThreadId || routeDraft.threadId !== activeThreadId || !activeThread) {
      return
    }
    if (consumedRouteDraftRef.current === routeDraft.clientRequestId) {
      return
    }

    consumedRouteDraftRef.current = routeDraft.clientRequestId
    navigate(location.pathname, { replace: true, state: null })
    void startDraftRun({
      message: routeDraft.message,
      attachments: routeDraft.attachments,
      sourceMode: routeDraft.sourceMode,
      clientRequestId: routeDraft.clientRequestId,
    })
  }, [activeThread, activeThreadId, location.pathname, location.state, navigate])

  const handleReviewAction = async (item: AIGeneratedChecklistItem, action: 'approve' | 'reject') => {
    if (!activeThreadId) {
      return
    }

    setPendingItemId(item.id)
    setError('')
    setMessage('')

    try {
      if (action === 'approve') {
        await approveGeneratedChecklistItem(accessToken, activeOrgId, item.id)
        setMessage(`"${item.title}" was added to the checklist batch.`)
      } else {
        await rejectGeneratedChecklistItem(accessToken, activeOrgId, item.id)
        setMessage(`"${item.title}" was rejected.`)
      }

      const [threadResult] = await Promise.all([fetchAIChatThread(accessToken, activeOrgId, activeThreadId), refreshThreads()])
      setActiveThread(threadResult.thread)
    } catch (actionError) {
      setError(getErrorMessage(actionError, `Unable to ${action} the generated checklist item.`))
    } finally {
      setPendingItemId(null)
    }
  }

  return (
    <div className="ai-chat-page ai-chat-page--thread">
      <AIChatHeader
        title={activeThread?.title || bootstrap.assistant_name || 'BugCatcher AI'}
        subtitle={activeThread ? formatThreadContextLabel(activeThread.draft_context) : 'Open an AI draft thread'}
        leading={<button type="button" className="icon-button ai-chat-back-button" aria-label="Back to AI chat landing page" onClick={() => navigate('/app/ai-chat')}><Icon name="arrow" /></button>}
        actions={
          <>
            <ThemeToggle />
            <button type="button" className="icon-button" aria-label="Open conversation history" onClick={() => setRailOpen((current) => !current)}>
              <Icon name="more" />
            </button>
          </>
        }
      />
      <div className="ai-chat-page__body ai-chat-page__body--thread">
        {message ? <FormMessage tone="success">{message}</FormMessage> : null}
        {error ? <FormMessage tone="error">{error}</FormMessage> : null}

        <button type="button" className={`ai-chat-thread-drawer__backdrop ${railOpen ? 'is-open' : ''}`} aria-label="Close conversation history" onClick={() => setRailOpen(false)} />

        <aside className={`ai-chat-thread-drawer ${railOpen ? 'is-open' : ''}`}>
          <div className="ai-chat-thread-drawer__header">
            <div>
              <p className="eyebrow">Recent chats</p>
              <h2>History</h2>
            </div>
            <button type="button" className="button button--primary button--tiny" onClick={() => setSourceChooserOpen(true)}>
              New chat
            </button>
          </div>
          {loadingThreads ? (
            <p className="body-copy">Loading history...</p>
          ) : (
            <div className="ai-chat-history-list ai-chat-history-list--drawer">
              {threads.map((thread) => (
                <AIChatHistoryCard
                  key={thread.id}
                  summary={thread}
                  active={thread.id === activeThreadId}
                  onOpen={() => {
                    setRailOpen(false)
                    navigate(`/app/ai-chat/threads/${thread.id}`)
                  }}
                  onDelete={() => void handleDeleteThread(thread.id)}
                />
              ))}
            </div>
          )}
        </aside>

        {loadingThread ? (
          <section className="ai-chat-state-card">
            <p className="body-copy">Loading chat thread...</p>
          </section>
        ) : activeThread ? (
          <div className="ai-chat-thread-stage">
            <div className="ai-chat-thread-stage__tab-bar">
              <div className="ai-chat-thread-stage__tab-switch" role="tablist" aria-label="Thread view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeThreadTab === 'chat'}
                  aria-label="Show chat"
                  className={`ai-chat-thread-stage__tab ${activeThreadTab === 'chat' ? 'is-active' : ''}`}
                  onClick={() => setActiveThreadTab('chat')}
                >
                  <Icon name="chat" />
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeThreadTab === 'summary'}
                  aria-label="Show summary"
                  className={`ai-chat-thread-stage__tab ${activeThreadTab === 'summary' ? 'is-active' : ''}`}
                  onClick={() => setActiveThreadTab('summary')}
                >
                  <Icon name="checklist" />
                </button>
              </div>
            </div>
            {activeThreadTab === 'summary' ? (
              <div className="ai-chat-thread-stage__panel ai-chat-thread-stage__panel--summary">
                <AIChatSummaryCard
                  modeLabel={summary.modeLabel}
                  rows={summary.rows}
                  expanded
                  locked={Boolean(activeThread.draft_context.is_locked)}
                  onToggle={() => undefined}
                  showToggle={false}
                  onEditStep={activeThread.draft_context.is_locked ? undefined : (targetStep) => navigate(`/app/ai-chat/new?threadId=${activeThread.id}&step=${targetStep}`)}
                />
              </div>
            ) : (
              <div className="ai-chat-thread-stage__panel ai-chat-thread-stage__panel--chat">
                <section className="ai-chat-thread-stage__conversation">
                  <AIChatConversation
                    thread={activeThread}
                    assistantName={bootstrap.assistant_name || 'BugCatcher AI'}
                    emptyTitle="No conversation yet"
                    emptyMessage={
                      activeSourceMode === 'link'
                        ? 'This chat is ready for a link-based checklist draft.'
                        : 'This chat is ready for your first screenshot-based checklist draft.'
                    }
                    transientDraft={transientDraft}
                    pendingItemId={pendingItemId}
                    onReviewAction={(item, action) => void handleReviewAction(item, action)}
                  />
                </section>
                <AIChatComposer
                  sourceMode={activeSourceMode}
                  composer={composer}
                  attachments={attachments}
                  pending={pending}
                  canSend={canSend}
                  disabled={pending || !activeThread.draft_context.is_ready}
                  helperText={sourceModeComposerHelperText(activeSourceMode, Boolean(activeThread.draft_context.is_ready))}
                  placeholder={sourceModeComposerPlaceholder(activeSourceMode)}
                  onComposerChange={setComposer}
                  onAttachmentsChange={setAttachments}
                  onSend={() => void handleSend()}
                />
              </div>
            )}
          </div>
        ) : (
          <section className="ai-chat-state-card">
            <strong>Thread unavailable</strong>
            <p>The selected chat could not be loaded. Return to the AI chat landing page and choose another thread.</p>
          </section>
        )}
      </div>
      <AIChatSourceChooser
        bootstrap={bootstrap}
        open={sourceChooserOpen}
        onClose={() => setSourceChooserOpen(false)}
        onSelect={(sourceMode) => {
          setSourceChooserOpen(false)
          setRailOpen(false)
          navigate(buildNewChatRoute(sourceMode))
        }}
      />
    </div>
  )
}

export function AIChatPage({ view = 'landing' }: { view?: AIChatPageView }) {
  const { activeOrgId, session } = useAuth()
  const accessToken = session?.accessToken ?? ''
  const [bootstrap, setBootstrap] = useState<AIChatBootstrap | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!activeOrgId || !accessToken) {
      return
    }

    let ignore = false

    const run = async () => {
      try {
        const result = await fetchAIChatBootstrap(accessToken, activeOrgId)
        if (!ignore) {
          setBootstrap(result)
          setError('')
        }
      } catch (loadError) {
        if (!ignore) {
          setError(getErrorMessage(loadError, 'Unable to load AI checklist drafting configuration.'))
        }
      }
    }

    void run()

    return () => {
      ignore = true
    }
  }, [accessToken, activeOrgId])

  if (!activeOrgId) {
    return (
      <AIChatStateScreen title="AI Chat" subtitle="Checklist drafting assistant">
        <strong>Select an active organization first</strong>
        <p>The AI chat is only available inside a specific organization workspace.</p>
      </AIChatStateScreen>
    )
  }

  if (!bootstrap && !error) {
    return (
      <AIChatStateScreen title="AI Chat" subtitle="Checklist drafting assistant">
        <p className="body-copy">Loading AI chat...</p>
      </AIChatStateScreen>
    )
  }

  if (error && !bootstrap) {
    return (
      <AIChatStateScreen title="AI Chat" subtitle="Checklist drafting assistant">
        <FormMessage tone="error">{error}</FormMessage>
      </AIChatStateScreen>
    )
  }

  if (!bootstrap?.enabled) {
    return (
      <AIChatStateScreen title="AI Checklist Drafting Setup" subtitle="Super Admin configuration is required">
        <div className="bullet-stack">
          <div className="bullet-row">
            <span className="bullet-row__marker" />
            <p>{bootstrap?.error_message || 'AI checklist drafting is not configured correctly. Go to Super Admin > AI Admin.'}</p>
          </div>
          <div className="bullet-row">
            <span className="bullet-row__marker" />
            <p>Enable a text-capable generator for link mode, and add a vision-capable generator if you also want screenshot mode.</p>
          </div>
        </div>
      </AIChatStateScreen>
    )
  }

  if (view === 'create') {
    return <AIChatCreateView bootstrap={bootstrap} accessToken={accessToken} activeOrgId={activeOrgId} />
  }

  if (view === 'thread') {
    return <AIChatThreadView bootstrap={bootstrap} accessToken={accessToken} activeOrgId={activeOrgId} />
  }

  return <AIChatLandingView bootstrap={bootstrap} accessToken={accessToken} activeOrgId={activeOrgId} />
}
