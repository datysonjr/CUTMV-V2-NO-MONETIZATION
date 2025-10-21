# CUTMV - Music Video Cut-Down Tool

## Overview
CUTMV is a specialized web application for music video editing and clip creation. It enables users to upload a video, generate clips using adaptive algorithms or custom timestamps, and apply professional fade effects through an intuitive interface. The project aims to bring advanced video editing capabilities to music creators without the complexity of traditional tools, with a vision to become the go-to platform for quick, high-quality music video content generation.

## User Preferences
Preferred communication style: Simple, everyday language.
Interface preference: Simple, minimal - focus on core workflow: upload, timestamps, download.
Large file support: Needs to handle 3-5GB video files reliably without hanging or crashes.
Progress feedback: Users want real-time upload progress for large files.
Storage management: Automatic cleanup preferred to prevent workspace disk issues.

## System Architecture
The application employs a modern full-stack architecture with clear separation of concerns.

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Framework**: shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens
- **State Management**: TanStack Query for server state, React hooks for local state
- **Routing**: Wouter

### Backend
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Style**: REST API with JSON responses
- **Video Processing**: FFmpeg for video manipulation, metadata extraction, and advanced features like black frame elimination, cross-dissolves, and audio fades.
- **File Upload**: Multer middleware for handling multipart/form-data. Optimized for large files with conservative chunking and parallel uploads to prevent hangs.

### Data Architecture
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema**: Defined in shared TypeScript files for type safety.
- **Storage**: Local filesystem for uploaded videos and generated clips, with organized directory structures and automatic cleanup strategies. In-memory storage for development fallback.

### Key Features & Design Decisions
- **Progressive Workflow**: A 3-step user flow (Upload → Timestamps → Process).
- **Video Clip Generation**: Supports batch processing, quality settings, and ZIP file generation for multiple clips.
- **Advanced Export Features**: Includes generation of multiple GIFs, high-quality still thumbnails, and Spotify Canvas vertical video loops.
- **Aspect Ratio Options**: Supports 16:9 (widescreen) and 9:16 (vertical) exports, including smart center cropping and automatic letterbox removal for vertical formats.
- **Independent Export Options**: Allows users to generate cutdowns, GIFs, thumbnails, or Spotify Canvas independently or in combination, with conditional UI display.
- **UI/UX Design**: Responsive, mobile-first design with comprehensive error handling. Follows Full Digital's branding guidelines with a black, green, and gray color scheme, integrating their logo and tagline.
- **Legal Framework**: Includes intellectual property protection (license, copyright notices), and public-facing legal pages (Terms of Service, Privacy Policy).

## External Dependencies

### Core
- **@neondatabase/serverless**: PostgreSQL database driver.
- **drizzle-orm**: Type-safe ORM.
- **fluent-ffmpeg**: Node.js wrapper for FFmpeg.
- **multer**: Express middleware for file uploads.
- **adm-zip**: ZIP file creation.

### UI
- **@radix-ui/***: Headless UI primitives.
- **@tanstack/react-query**: Server state management.
- **tailwindcss**: Utility-first CSS framework.
- **react-dropzone**: Drag-and-drop file upload.

### Development
- **vite**: Build tool.
- **tsx**: TypeScript execution for Node.js.
- **esbuild**: Fast JavaScript bundler.
## Recent Changes

### August 3, 2025 - PROJECT OPTIMIZATION & STORAGE CLEANUP
- **STORAGE OPTIMIZATION**: Comprehensive cleanup of local storage to reduce project download size
  - Removed large video files (17MB+ test videos and uploaded content)
  - Cleaned up attached assets, removing screenshots and documentation files
  - Eliminated temporary files and processed content to prevent bloated downloads
  - Project size reduced from ~430MB to ~400MB (primarily node_modules)
  - Maintained essential assets (Full Digital logo) while removing development artifacts
- **DOWNLOAD EFFICIENCY**: Optimized project structure for clean distribution
  - Uploads directory maintained but emptied of test content
  - Preserved legal framework and IP protection without bloating file size
  - Clean, professional codebase ready for deployment and distribution

### July 18, 2025 - COMPREHENSIVE LEGAL FRAMEWORK IMPLEMENTATION
- **INTELLECTUAL PROPERTY SECURITY**: Complete IP protection system implemented per Full Digital directive
  - Added proprietary software license (LICENSE.txt) with clear ownership and usage restrictions
  - Copyright notices added to all major files (© 2025 Full Digital LLC)
  - Terms of Use banner integrated into footer with reverse-engineering prohibition
  - Proprietary software headers added to prevent unauthorized distribution
- **LEGAL PROTECTION FRAMEWORK**: Comprehensive protection against code theft and unauthorized use
  - Clear ownership declaration on every major file
  - Usage restrictions prominently displayed to users
  - Legal foundation established for IP enforcement
  - Compliance with Full Digital's intellectual property protection requirements
- **PUBLIC-FACING LEGAL PAGES**: Professional Terms of Service and Privacy Policy implementation
  - Comprehensive Terms of Service (/terms) covering service description, IP rights, payment terms, limitations
  - Detailed Privacy Policy (/privacy) covering data collection, usage, security, and user rights
  - Full legal compliance framework addressing CCPA, international transfers, and children's privacy
  - Professional routing and navigation with responsive design matching brand identity
  - Clear user rights documentation and contact information for legal inquiries

### July 18, 2025 - AUTOMATIC LETTERBOX REMOVAL SYSTEM
- **LETTERBOX DETECTION**: Advanced black bar detection and removal for 9:16 exports
  - Two-pass FFmpeg processing: analyze letterboxing then apply intelligent crop
  - Automatic cropdetect filter implementation with frame-by-frame analysis
  - Smart fallback for videos without existing letterboxing
  - Center crop optimization to fill 1080x1920 with visible content only
- **ZERO BLACK BARS GUARANTEE**: Complete elimination of letterboxing in vertical exports
  - Detects and removes existing black bars from source videos before 9:16 conversion
  - Ensures vertical exports show only actual content (artists, studio scenes)
  - Motion tracking maintained while cropping to visible content boundaries
  - Professional auto-reframe functionality similar to Adobe tools
```