// A render-error fence around the lazy Canvas. A shader that fails to compile on one GPU, or a
// driver that throws inside WebGLRenderer, must cost the person the graph and nothing else: the
// shell's table is the fallback, so every fact on the screen stays readable. Class component
// because React still offers no hook for `getDerivedStateFromError`.
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  fallback: ReactNode
  /** Reported so the shell can show its notice; never rethrown. */
  onError?: (error: Error) => void
  children: ReactNode
}

interface State {
  failed: boolean
}

export class SceneErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError?.(error)
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
