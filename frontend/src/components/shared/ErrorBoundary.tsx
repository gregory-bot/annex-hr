import { Component, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Contains a crash to the page that caused it, with a way to recover. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Page crashed:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
          <TriangleAlert className="size-5" />
        </div>
        <h1 className="text-lg font-bold">This page hit a problem</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{this.state.error.message}</p>
        <Button className="mt-5" onClick={() => this.setState({ error: null })}>
          Try again
        </Button>
      </div>
    )
  }
}
