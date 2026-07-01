// Tiny i18n layer: a flat dictionary keyed by dotted string ids, plus a React
// context so any component can translate without prop-threading the language.

import { createContext, useContext, useMemo } from 'react'
import type { Language } from './store'

type Entry = string | ((...args: never[]) => string)

// Chinese is the source of truth for the key set; `en` must mirror it exactly.
const zh = {
  // Rail / shell
  'rail.new': '新对话',
  'rail.history': '历史',
  'rail.settings': '设置',
  'common.close': '关闭',

  // Settings
  'settings.title': '设置',
  'settings.provider': '服务商',
  'settings.groupSubscription': '订阅',
  'settings.groupApi': 'API',
  'settings.apiKey': 'API 密钥',
  'settings.getKey': '获取 key ↗',
  'settings.fetchBusy': '获取中…',
  'settings.fetchOk': (n: number) => `✓ ${n} 个`,
  'settings.fetchFail': '✗ 失败',
  'settings.fetchModels': '获取模型',
  'settings.model': '模型',
  'settings.testBusy': '测试中…',
  'settings.testOk': '✓ 通过',
  'settings.testFail': '✗ 失败',
  'settings.test': '测试',
  'settings.needKey': '请先输入 API 密钥。',
  'settings.pickModelNote': '先在上方获取模型列表，然后选择一个。',
  'settings.theme': '主题',
  'settings.themeSystem': '跟随系统',
  'settings.themeLight': '浅色',
  'settings.themeDark': '深色',
  'settings.language': '语言',
  'settings.save': '保存',
  'settings.saved': '已保存 ✓',

  // License (iakms)
  'license.title': '授权',
  'license.statusUnlicensed': '未激活',
  'license.statusActive': '已激活',
  'license.statusExpired': '已过期',
  'license.statusInvalid': '无效',
  'license.activate': '激活',
  'license.activating': '激活中…',
  'license.policy': '套餐',
  'license.expires': '到期',
  'license.seats': '设备数',
  'license.rebind': '换绑设备',
  'license.rebindHint': '在新设备上用恢复码把授权迁移到本机。',
  'license.recoveryPlaceholder': '8 位恢复码',
  'license.rebinding': '换绑中…',
  'license.newRecoveryCode': '新的恢复码（请妥善保存）',
  'license.unbind': '解绑',
  'license.unbinding': '解绑中…',
  'license.startTrial': '开始免费试用',
  'license.starting': '开通中…',
  'license.trialBadge': '试用',
  'license.trialDaysLeft': (n: number) => `免费试用 · 剩余 ${n} 天`,
  'license.trialEnded': '免费试用已结束',

  // Chat — quick actions
  'chat.quote': '引用标签页',
  'chat.summarize': '总结',
  'chat.translate': '翻译',
  'chat.write': '帮我写',
  'chat.research': '研究',
  'chat.prefillSummarize': '请总结以下内容的要点：\n',
  'chat.prefillTranslate': '请翻译成中文：\n',
  'chat.prefillWrite': '帮我写一段：',
  'chat.prefillResearch': '就以下主题做一次多来源研究，给出要点与结论：\n',

  // Chat — welcome / hub
  'chat.welcomeTitle': '有什么可以帮你？',
  'chat.welcomeSubPre': '问任何问题，或输入 ',
  'chat.welcomeSubPost': ' 引用当前页面作为上下文。',
  'hub.title': '与浏览器对话',
  'hub.sub': '你的 key · 直连 provider · 数据不出本机',
  'hub.capSummarizeDesc': '总结当前页面或粘贴的内容',
  'hub.capTranslateDesc': '翻译选中或粘贴的文本',
  'hub.capWriteDesc': '起草邮件、文案、代码',
  'hub.capResearchDesc': '多来源查证，给出结论',
  'top.trust': '本地 · BYOK',

  // Chat — composer
  'chat.needKey': '请先在设置中填入 API 密钥。',
  'chat.toolQuote': '引用页面 (@)',
  'tool.screenshot': '截图',
  'tool.attach': '附件',
  'tool.expert': '专家',
  'tool.skill': '技能',
  'tool.apps': '应用',
  'tool.soon': '（即将支持）',
  'chat.placeholder': '输入消息…（@ 引用页面）',
  'chat.placeholderNoKey': '请在设置中填入 API 密钥 →',
  'chat.pickModel': '选择模型',
  'chat.permManual': '手动',
  'chat.permAuto': '自动',

  // Chat — agent activity (live, from the loop's event stream)
  'chat.actCompacting': '压缩上下文…',
  'chat.actCompacted': '已压缩上下文',
  'chat.actTool': '工具',
  'chat.actToolDone': '完成',
  'chat.actToolFail': '失败',
  'chat.send': '发送',
  'chat.goSettings': '前往设置添加密钥',
  'chat.attachPage': '引用页面',
  'chat.loadingTabs': '加载标签页…',
  'chat.noTabs': '没有可引用的标签页。',
  'chat.newChatTitle': '新对话',

  // History
  'history.title': '历史',
  'history.empty': '还没有对话。点击 + 开始一个。',
  'history.untitled': '未命名',
  'history.msgs': (n: number) => `${n} 条`,
  'time.justNow': '刚刚',
  'time.mAgo': (m: number) => `${m} 分钟前`,
  'time.hAgo': (h: number) => `${h} 小时前`,
  'time.dAgo': (d: number) => `${d} 天前`,

  // Dropdown (FilterSelect)
  'fselect.search': '搜索…',
  'fselect.empty': '无匹配',
}

export type TKey = keyof typeof zh

const en: Record<TKey, Entry> = {
  'rail.new': 'New chat',
  'rail.history': 'History',
  'rail.settings': 'Settings',
  'common.close': 'Close',

  'settings.title': 'Settings',
  'settings.provider': 'Provider',
  'settings.groupSubscription': 'Subscription',
  'settings.groupApi': 'API',
  'settings.apiKey': 'API key',
  'settings.getKey': 'Get a key ↗',
  'settings.fetchBusy': 'Fetching…',
  'settings.fetchOk': (n: number) => `✓ ${n}`,
  'settings.fetchFail': '✗ Failed',
  'settings.fetchModels': 'Fetch models',
  'settings.model': 'Model',
  'settings.testBusy': 'Testing…',
  'settings.testOk': '✓ Passed',
  'settings.testFail': '✗ Failed',
  'settings.test': 'Test',
  'settings.needKey': 'Enter an API key first.',
  'settings.pickModelNote': 'Fetch the model list above, then pick one.',
  'settings.theme': 'Theme',
  'settings.themeSystem': 'System',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.language': 'Language',
  'settings.save': 'Save',
  'settings.saved': 'Saved ✓',

  'license.title': 'License',
  'license.statusUnlicensed': 'Not activated',
  'license.statusActive': 'Active',
  'license.statusExpired': 'Expired',
  'license.statusInvalid': 'Invalid',
  'license.activate': 'Activate',
  'license.activating': 'Activating…',
  'license.policy': 'Plan',
  'license.expires': 'Expires',
  'license.seats': 'Seats',
  'license.rebind': 'Rebind device',
  'license.rebindHint': 'Use your recovery code to move the license to this device.',
  'license.recoveryPlaceholder': '8-digit recovery code',
  'license.rebinding': 'Rebinding…',
  'license.newRecoveryCode': 'New recovery code (save it!)',
  'license.unbind': 'Unbind',
  'license.unbinding': 'Unbinding…',
  'license.startTrial': 'Start free trial',
  'license.starting': 'Starting…',
  'license.trialBadge': 'Trial',
  'license.trialDaysLeft': (n: number) => `Free trial · ${n} days left`,
  'license.trialEnded': 'Free trial ended',

  'chat.quote': 'Reference tab',
  'chat.summarize': 'Summarize',
  'chat.translate': 'Translate',
  'chat.write': 'Write',
  'chat.research': 'Research',
  'chat.prefillSummarize': 'Summarize the key points of the following:\n',
  'chat.prefillTranslate': 'Translate the following into English:\n',
  'chat.prefillWrite': 'Help me write: ',
  'chat.prefillResearch': 'Research the following across multiple sources; give key points and a conclusion:\n',

  'chat.welcomeTitle': 'How can I help?',
  'chat.welcomeSubPre': 'Ask anything, or type ',
  'chat.welcomeSubPost': ' to reference the current page as context.',
  'hub.title': 'Chat with browser',
  'hub.sub': 'Your keys · direct to providers · data stays local',
  'hub.capSummarizeDesc': 'Summarize this page or pasted content',
  'hub.capTranslateDesc': 'Translate selected or pasted text',
  'hub.capWriteDesc': 'Draft emails, copy, or code',
  'hub.capResearchDesc': 'Cross-check sources, reach a conclusion',
  'top.trust': 'Local · BYOK',

  'chat.needKey': 'Set your API key in Settings first.',
  'chat.toolQuote': 'Reference page (@)',
  'tool.screenshot': 'Screenshot',
  'tool.attach': 'Attachment',
  'tool.expert': 'Expert',
  'tool.skill': 'Skill',
  'tool.apps': 'Apps',
  'tool.soon': ' (coming soon)',
  'chat.placeholder': 'Message…  (@ to attach a page)',
  'chat.placeholderNoKey': 'Set an API key in Settings →',
  'chat.pickModel': 'Select model',
  'chat.permManual': 'Manual',
  'chat.permAuto': 'Auto',

  // Chat — agent activity (live, from the loop's event stream)
  'chat.actCompacting': 'Compacting context…',
  'chat.actCompacted': 'Context compacted',
  'chat.actTool': 'Tool',
  'chat.actToolDone': 'done',
  'chat.actToolFail': 'failed',
  'chat.send': 'Send',
  'chat.goSettings': 'Go to Settings to add a key',
  'chat.attachPage': 'Attach a page',
  'chat.loadingTabs': 'Loading tabs…',
  'chat.noTabs': 'No referenceable tabs.',
  'chat.newChatTitle': 'New chat',

  'history.title': 'History',
  'history.empty': 'No conversations yet. Start one with the + button.',
  'history.untitled': 'Untitled',
  'history.msgs': (n: number) => `${n} msgs`,
  'time.justNow': 'just now',
  'time.mAgo': (m: number) => `${m}m ago`,
  'time.hAgo': (h: number) => `${h}h ago`,
  'time.dAgo': (d: number) => `${d}d ago`,

  'fselect.search': 'Search…',
  'fselect.empty': 'No matches',
}

const dict: Record<Language, Record<TKey, Entry>> = { zh, en }

/** Bound translator: `t('key')` or `t('key', arg)` for parametrized entries. */
export type T = (key: TKey, ...args: never[]) => string

export function translate(lang: Language, key: TKey, ...args: never[]): string {
  const e = (dict[lang] ?? zh)[key] ?? zh[key]
  return typeof e === 'function' ? e(...args) : e
}

export const LangContext = createContext<Language>('zh')

/** Returns a translator bound to the current language; `.lang` exposes it. */
export function useT(): T & { lang: Language } {
  const lang = useContext(LangContext)
  return useMemo(() => {
    const t = ((key: TKey, ...args: never[]) => translate(lang, key, ...args)) as T & {
      lang: Language
    }
    t.lang = lang
    return t
  }, [lang])
}
