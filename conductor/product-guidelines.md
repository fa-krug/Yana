# Development Principles
- **KISS (Keep It Simple, Stupid):** Avoid over-engineering. Seek the simplest solution that effectively meets the requirements.
- **Modern Standards:** Strictly follow the latest Django and Python design principles and best practices (e.g., using `pathlib`, async where appropriate, modern class-based views).
- **API-First Design:** The primary interface for users is the Google Reader API. Every feature must be designed with the priority of providing high-quality, reliable data to external clients.
- **Maintainability & Extensibility:** Code must be structured to allow new aggregators and features to be added with minimal friction by developers.
- **Quality Over Quantity:** It is better to skip an article entirely than to save a "half-article" with broken content or missing critical metadata.

# Technical Standards
- **Clarity over Cleverness:** Prioritize readable and maintainable code. Avoid complex patterns where a simple, idiomatic solution exists.
- **Strict Typing:** Mandatory use of Python type hints for all new code to ensure robust IDE support and catch potential errors at development time.
- **Self-Documenting Code:** Every service, model, and aggregator must have clear docstrings explaining its purpose and any non-obvious logic.
- **Stateless Extraction:** Aggregators must remain stateless, focusing purely on transforming raw input (HTML/XML) into structured article data.

# User Interface (Admin-Only)
- **Django Admin Focus:** The web interface is strictly limited to the standard Django Admin.
- **No Custom JavaScript:** Avoid custom JS. Rely on standard Django forms and admin features.
- **Proven Extensions:** Only use well-established, battle-tested third-party Django admin extensions (e.g., autocomplete, filtering) when absolutely necessary.

# Content & Privacy
- **Privacy-Centric Processing:** Aggressively strip trackers, scripts, and unnecessary external styling from extracted content before storage and delivery.
- **Clean HTML:** Extracted content must be sanitized and formatted to provide a consistent reading experience across different RSS clients.
