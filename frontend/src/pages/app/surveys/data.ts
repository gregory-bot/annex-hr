export type QuestionType = 'emoji' | 'nps' | 'choice' | 'text'

export interface Question {
  id: string
  type: QuestionType
  text: string
  options?: string[]
}

export const QUESTION_TYPES: { value: QuestionType; label: string; hint: string }[] = [
  { value: 'emoji', label: 'Emoji scale', hint: '5-point sentiment' },
  { value: 'nps', label: 'NPS 0–10', hint: 'Likelihood to recommend' },
  { value: 'choice', label: 'Multiple choice', hint: 'Pick one option' },
  { value: 'text', label: 'Free text', hint: 'Open comment' },
]

export const EMOJIS = [
  { e: '😞', label: 'Very unhappy' },
  { e: '🙁', label: 'Unhappy' },
  { e: '😐', label: 'Neutral' },
  { e: '🙂', label: 'Happy' },
  { e: '😄', label: 'Very happy' },
]

let seq = 0
export const newId = () => `q-${Date.now().toString(36)}-${seq++}`

export function blankQuestion(type: QuestionType): Question {
  const text = {
    emoji: 'How do you feel about your workload this month?',
    nps: 'How likely are you to recommend working here to a friend?',
    choice: 'Which of these would most improve your week?',
    text: 'What is one thing we should start, stop or continue?',
  }[type]
  return { id: newId(), type, text, options: type === 'choice' ? ['Fewer meetings', 'Clearer priorities', 'Better tools', 'More recognition'] : undefined }
}

export const PULSE_QUESTIONS: Question[] = [
  { id: 'p1', type: 'emoji', text: 'How are you feeling about work this week?' },
  { id: 'p2', type: 'emoji', text: 'I have the tools and resources to do my job well.' },
  { id: 'p3', type: 'emoji', text: 'My manager gives me useful, regular feedback.' },
  { id: 'p4', type: 'emoji', text: 'I see a clear path to grow my career here.' },
  { id: 'p5', type: 'nps', text: 'How likely are you to recommend us as a place to work?' },
  { id: 'p6', type: 'choice', text: 'What would most improve your day-to-day?', options: ['Fewer meetings', 'Clearer priorities', 'Better tools', 'More recognition'] },
  { id: 'p7', type: 'text', text: 'Anything else you would like leadership to hear? (optional)' },
]

/** Distribution per emoji question, % of respondents from 😞 to 😄. */
export const EMOJI_RESULTS: Record<string, number[]> = {
  p1: [4, 9, 21, 42, 24],
  p2: [6, 14, 24, 38, 18],
  p3: [5, 11, 19, 40, 25],
  p4: [9, 18, 29, 30, 14],
}

export type Sentiment = 'Positive' | 'Neutral' | 'Constructive'

export const COMMENTS: { text: string; sentiment: Sentiment; dept: string; ago: string }[] = [
  { text: 'The new hybrid policy has made a huge difference to my commute and my energy levels. Thank you!', sentiment: 'Positive', dept: 'Operations', ago: '2h ago' },
  { text: 'Sprint planning feels rushed. We commit before we understand the scope, then scramble in the last week.', sentiment: 'Constructive', dept: 'Engineering', ago: '5h ago' },
  { text: 'My manager checks in every week and actually follows up. It shows.', sentiment: 'Positive', dept: 'Customer Success', ago: 'Yesterday' },
  { text: 'Would love clearer criteria for promotion — right now it feels like it depends on who you know.', sentiment: 'Constructive', dept: 'Product', ago: 'Yesterday' },
  { text: 'Office Wi-Fi on the 4th floor is still unreliable during all-hands.', sentiment: 'Neutral', dept: 'Finance', ago: '2 days ago' },
  { text: 'The Mashujaa Day team outing was the best one yet. More of that please.', sentiment: 'Positive', dept: 'People & Culture', ago: '2 days ago' },
  { text: 'Too many tools for the same thing. We use three different places to track tasks.', sentiment: 'Constructive', dept: 'Engineering', ago: '3 days ago' },
  { text: 'Salary advance through payroll helped me a lot this term with school fees.', sentiment: 'Positive', dept: 'Operations', ago: '3 days ago' },
  { text: 'Onboarding was smooth but I still do not know who owns what across teams.', sentiment: 'Neutral', dept: 'Growth & Marketing', ago: '4 days ago' },
]
