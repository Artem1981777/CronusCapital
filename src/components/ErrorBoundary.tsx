import { Component } from "react"
import type { ErrorInfo, ReactNode } from "react"

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props)
		this.state = { hasError: false, message: "" }
	}

	static getDerivedStateFromError(error: unknown): State {
		const message = error instanceof Error ? error.message : String(error)
		return { hasError: true, message }
	}

	componentDidCatch(error: unknown, info: ErrorInfo) {
		// CUSTOMIZE: wire to Sentry / analytics here
		console.error("[Cronus ErrorBoundary]", error, info.componentStack)
	}

	private handleReload = () => {
		this.setState({ hasError: false, message: "" })
		if (typeof window !== "undefined") window.location.reload()
	}

	render() {
		if (!this.state.hasError) return this.props.children
		return (
			<div className="cd-boundary">
				<div className="cd-boundary-card">
					<div className="cd-boundary-eye">𓂀</div>
					<div className="cd-boundary-title">THE ORACLE STUMBLED</div>
					<p className="cd-boundary-text">Непредвиденная ошибка интерфейса. Состояние не потеряно — можно перезапустить оракула.</p>
					{this.state.message && <pre className="cd-boundary-detail">{this.state.message}</pre>}
					<button className="cd-boundary-btn" onClick={this.handleReload}>↻ RESTART ORACLE</button>
				</div>
			</div>
		)
	}
}
