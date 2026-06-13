import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { WagmiProvider } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { wagmiConfig } from "./wagmiConfig"
import { ErrorBoundary } from "./components/ErrorBoundary"
import "./cronus.css"
import "./index.css"
import App from "./App"

const queryClient = new QueryClient()

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<WagmiProvider config={wagmiConfig}>
			<QueryClientProvider client={queryClient}>
				<ErrorBoundary>
					<App />
				</ErrorBoundary>
			</QueryClientProvider>
		</WagmiProvider>
	</StrictMode>,
)
