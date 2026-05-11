# Routing.run AI Chatbot - TODO

## Backend Setup
- [x] Add routing.run API key secret configuration
- [x] Create /api/chat streaming endpoint with routing.run integration
- [x] Implement streaming response handler with AbortController support
- [x] Add error handling and validation

## Frontend - Chat UI
- [x] Build chat message display component with auto-scroll
- [x] Create user message bubble styling
- [x] Create AI message bubble with Markdown rendering
- [x] Build message input field with send button
- [x] Add stop generation button
- [x] Add clear chat button
- [x] Implement streaming message updates

## Frontend - Model Selector
- [x] Create model dropdown with all 7 routing.run models
- [x] Implement model state management
- [x] Wire model selection to API requests

## Frontend - Settings Panel
- [x] Create settings modal/drawer
- [x] Build API key input field
- [x] Implement localStorage persistence for API key
- [x] Add test connection button with validation

## Frontend - Markdown & Code Rendering
- [x] Integrate react-markdown for Markdown support (via Streamdown)
- [x] Add syntax highlighting for code blocks (via Streamdown)
- [x] Implement copy code button for code blocks (via Streamdown)
- [x] Test with various code languages

## Frontend - UI & Styling
- [x] Design dark mode theme with TailwindCSS
- [x] Create main chat layout (chat area + input)
- [x] Style message bubbles and spacing
- [x] Add smooth animations and transitions
- [x] Ensure responsive design for mobile

## Testing & Polish
- [x] Test streaming responses end-to-end
- [x] Test model switching
- [x] Test API key persistence
- [x] Test error handling and edge cases
- [x] Verify performance and smooth interactions
