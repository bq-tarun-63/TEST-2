# 📚 ReventLabs Books (Notes App)

An aesthetic, WYSIWYG editor with AI-powered features. Built for speed, modularity, and a premium writing experience.

---

## ✨ Features

- **📝 Block-Based Editing**: A seamless, modern writing interface with a clean books-style layout.
- **🤖 AI-Powered Autocomplete**: Intelligent writing assistance powered by OpenAI and Gemini.
- **🖼️ Rich Media Support**: Easily integrated page icons (emojis) and beautiful page covers.
- **📁 Monorepo Architecture**: Managed with **pnpm** and **Turbo** for efficient development and scaling.
- **📱 Multi-Platform**: Native iOS app support alongside a high-performance Next.js web application.
- **🚀 Real-time Highlights**: Advanced editor features including AI highlight, image resizing, and math support.

---

## 🛠️ Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Next.js](https://nextjs.org/) (App Router) |
| **Monorepo** | [Turbo](https://turbo.build/) & [pnpm](https://pnpm.io/) |
| **Styling** | [Tailwind CSS](https://tailwindcss.com/) |
| **Editor Core** | [Tiptap](https://tiptap.dev/) / [Novel](https://novel.sh/) |
| **Database** | [MongoDB](https://www.mongodb.com/) & [Mongoose](https://mongoosejs.com/) |
| **AI Integration** | OpenAI API & Google Gemini API |
| **Mobile** | [Expo](https://expo.dev/) (React Native) |

---

## 📂 Project Structure

- `apps/web/` – Main Next.js application & API.
- `apps/ios/` – Native mobile application.
- `packages/headless/` – Standalone, reusable editor package.
- `packages/tsconfig/` – Shared TypeScript configurations.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (Latest LTS recommended)
- [pnpm](https://pnpm.io/installation) installed globally.

### Setup
1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd books-T/books
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Configure Environment**:
   Copy the example environment file and fill in your keys:
   ```bash
   cp apps/web/.env.example apps/web/.env
   ```

4. **Run in development**:
   ```bash
   pnpm dev
   ```

---

## 🏗️ Development Commands

- `pnpm dev`: Start development servers for all apps.
- `pnpm build`: Build all packages and apps via Turbo.
- `pnpm lint`: Run Biome lint on the workspace.
- `pnpm format:fix`: Automatically fix code formatting.
- `pnpm typecheck`: Run TypeScript type checks.

---

## 🤝 Guidelines

- **Commit Messages**: We use [Conventional Commits](https://www.conventionalcommits.org/). e.g., `feat: add AI sidebar`.
- **Formatting**: Code is managed with **Biome**. Run `pnpm format:fix` before committing.

---

## 📄 License
This project is private and proprietary.
