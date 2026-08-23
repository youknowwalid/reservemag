// Final, legally-provided text for /privacy-policy and /terms-of-service --
// inserted verbatim, character-for-character, as supplied. Do not edit,
// rephrase, shorten, or "improve" either string; any future change to
// the actual legal wording should come from a new final version supplied
// the same way, not a copy-edit made here.
//
// The two documents were supplied in different source formats and are
// rendered accordingly, not retrofitted into a shared format:
//   - PRIVACY_POLICY_TEXT is plain text (no markdown syntax at all) --
//     rendered by PlainLegalText.tsx, a small structural parser that
//     infers headings ("N. Title" lines) and list blocks (runs of short,
//     unpunctuated lines) from LINE SHAPE only. It never adds, removes,
//     or reorders a single word -- it only decides which HTML tag wraps
//     an already-verbatim run of text.
//   - TERMS_OF_SERVICE_MARKDOWN is genuine CommonMark (#, ##, **bold**,
//     -- lists, --- rules) as supplied -- rendered via react-markdown so
//     that syntax renders as intended instead of appearing as literal
//     '#'/'**' characters on the page.
//
// EDITORIAL_POLICY_MARKDOWN, ADVERTISING_MARKDOWN, LEGAL_MARKDOWN, and
// EDITORIAL_BOARD_INTRO_MARKDOWN (added for the four new footer pages)
// are the same kind of genuine CommonMark as TERMS_OF_SERVICE_MARKDOWN,
// inserted verbatim under the same no-edit rule, and rendered via
// react-markdown for the same reason -- see
// src/components/legal/legalMarkdownComponents.tsx for the shared
// typography mapping those four pages use (a copy of
// TermsOfServicePage.tsx's own `markdownComponents`, kept separate so
// this stage didn't touch that already-shipped page).
//
// EDITORIAL_BOARD_INTRO_MARKDOWN is deliberately only the STATIC
// intro/philosophy portion of the supplied Editorial Board content --
// it stops after "Our Philosophy" and does not include the "Board
// Members" section or its bracketed `[NAME]/[TITLE/ROLE]/[bio]`
// placeholder entries, which were explicit instructions to replace with
// a real, dynamic, admin-managed list (see
// src/services/editorialBoardService.ts and
// src/pages/EditorialBoardPage.tsx), never to hardcode verbatim as if
// they were real content.

export const PRIVACY_POLICY_TEXT = `PRIVACY POLICY

Last Updated: August 22, 2026

1. Introduction

Welcome to THE RESERVE.

This Privacy Policy explains how THE RESERVE ("Reserve," "we," "us," or "our") collects, uses, stores, and protects information when you visit our website, create an account, submit content, contribute photographs or editorial material, connect third-party accounts, or otherwise use our services.

We respect your privacy and aim to be transparent about the information we collect and how it is used.

By using THE RESERVE, you acknowledge the practices described in this Privacy Policy.

2. Information We Collect

Depending on how you use THE RESERVE, we may collect the following categories of information.

Information you provide directly

This may include:

Full name
Email address
Phone number
Account information
Profile information
Social-media profile URLs
Contributor information
Editorial submissions
Written material
Photographs and other images
Other files or materials you voluntarily submit
Communications you send to us

You are not required to provide information that is not necessary for a particular service or submission. However, some features may not function without certain information.

Information collected through authentication

If you create or access an account through a third-party authentication provider such as Google, we may receive information made available to us through that authentication process, such as your name, email address, profile identifier, and profile image, subject to the permissions and settings applicable to that service.

We do not receive your Google password.

Technical information

When you use our website, certain technical information may be processed automatically, such as:

IP address
Browser type
Device information
Operating system
Pages or features accessed
Basic technical logs
Information necessary to maintain security and functionality

The exact information collected may depend on your browser, device, authentication method, and how you interact with the website.

3. Photos and User-Submitted Content

THE RESERVE may allow users, contributors, photographers, writers, or other authorized individuals to submit photographs, articles, text, social-media URLs, and other editorial material.

Submitted photographs may include high-resolution or HD images.

By submitting content, you understand that we may need to store, process, review, edit, reproduce, publish, distribute, or otherwise use that material for the editorial and operational purposes described at the time of submission and in our Terms of Service.

You should not submit photographs or other material that you do not have the right or permission to provide.

4. How We Use Your Information

We may use information we collect to:

Create and manage accounts
Authenticate users
Provide and operate THE RESERVE
Communicate with users and contributors
Process editorial submissions
Review and prepare editorial content
Publish articles, photographs, and contributor material
Maintain our website and services
Operate editorial workflows
Facilitate authorized social-media publishing
Connect and manage third-party services
Protect the security and integrity of our services
Prevent fraud, abuse, or unauthorized access
Troubleshoot technical problems
Comply with applicable legal obligations
Improve our services and user experience

We may also process information when necessary to protect our rights, users, contributors, or the integrity of the publication.

5. Google and Third-Party Authentication

THE RESERVE may provide authentication through Google or other third-party authentication services.

When you use Google authentication, Google may provide us with information associated with your account, such as your name, email address, profile identifier, or profile image, depending on the permissions and configuration of the authentication service.

We do not receive your Google account password through OAuth authentication.

Your use of Google services is also subject to Google's own terms and privacy policies.

6. Instagram and Meta Integration

THE RESERVE may provide functionality that allows authorized users to connect an Instagram account and publish approved content to Instagram through Meta's APIs.

When you authorize this functionality, we may process information necessary to:

Authenticate your Instagram account
Identify the connected account
Establish and maintain the authorized connection
Perform publishing actions you have authorized
Send approved photographs, captions, and other publishing information to Instagram
Record information necessary to operate and troubleshoot the publishing process

THE RESERVE only requests and uses access necessary for the functionality provided by the application.

We do not claim access to private Instagram information that the relevant Meta APIs do not make available to the application.

Your use of Instagram and Meta services remains subject to their respective terms, policies, and privacy practices.

7. Instagram Access and Revocation

You may disconnect or revoke the application's access to your Instagram account using the mechanisms provided by Meta or Instagram, where available.

You may also contact THE RESERVE regarding an authorized connection or account-related request.

Once access is revoked, the application should no longer be able to perform actions requiring that authorization, subject to technical limitations and information that may already have been processed before revocation.

8. How We Use Contributor Content

Editorial submissions and other contributor materials may be reviewed and processed by THE RESERVE for editorial purposes.

This may include:

Editing and formatting
Fact-checking and editorial review
Creating headlines, summaries, captions, or other editorial elements
Selecting or preparing images
Preparing content for publication
Preparing content for authorized social-media publication

Where automated or AI-assisted tools are used as part of an editorial workflow, the material may be processed by the relevant service provider for the purpose of producing editorial output.

Editorial publication and usage rights are also governed by our Terms of Service and any separate agreement applicable to a contributor.

9. How We Store and Protect Information

We use technical and organizational measures designed to protect information against unauthorized access, alteration, disclosure, or destruction.

However, no internet-based system can be guaranteed to be completely secure.

You should therefore avoid submitting passwords, payment-card information, authentication credentials, API keys, or other confidential information through fields that are not specifically designed to receive such information.

10. Data Retention

We retain information for as long as reasonably necessary for the purposes for which it was collected, including providing services, maintaining editorial records, complying with legal obligations, resolving disputes, enforcing agreements, and protecting the security of our services.

Retention periods may vary depending on the type of information and the purpose for which it is processed.

Where information is no longer reasonably required, we may delete, anonymize, or otherwise dispose of it, subject to applicable legal, technical, editorial, and operational requirements.

11. When We Share Information

We may share information with:

Service providers that help operate our website and infrastructure
Authentication providers
Cloud hosting and storage providers
Technology and security providers
Services required to operate authorized Instagram/Meta publishing
Professional advisers where reasonably necessary
Government authorities or other parties where required by law

We do not sell personal information as a commercial data-broker service.

We only share information where reasonably necessary for the relevant service, business operation, legal obligation, security purpose, or other legitimate purpose.

12. Third-Party Services

THE RESERVE may rely on third-party services for functions such as:

Authentication
Hosting
Database and storage infrastructure
Content processing
Security
Social-media publishing
Analytics or technical monitoring

These providers may process information on our behalf or independently according to their own terms and privacy policies.

Where you interact directly with a third-party platform, that platform's own privacy policy and terms may also apply.

13. Cookies and Similar Technologies

THE RESERVE may use cookies, local storage, session technologies, or similar mechanisms necessary to:

Maintain authentication sessions
Keep the website secure
Remember relevant settings
Operate website functionality
Understand technical usage where applicable

You can control certain cookies through your browser settings. Disabling necessary technologies may affect the functionality of some parts of the website.

14. Your Rights and Choices

Depending on applicable law, you may have rights concerning your personal information, including the ability to:

Request access to certain information we hold about you
Request correction of inaccurate information
Request deletion of certain information
Request restriction of certain processing
Object to certain processing
Withdraw consent where processing is based on consent
Request information about how your data is processed

Some requests may be subject to legal, security, editorial, or other legitimate limitations.

To make a privacy-related request, contact us using the contact information provided on our website.

15. Account and Data Deletion

If you want to delete your THE RESERVE account or request deletion of personal information, contact us through the official contact channel provided on the website.

We may need to verify your identity before processing a deletion or access request.

Some information may need to be retained where required by law, necessary for legitimate business purposes, necessary to establish or defend legal claims, or otherwise subject to a legitimate retention requirement.

Deletion of an account does not necessarily mean that previously published editorial content will automatically be removed from THE RESERVE.

Published editorial material may be retained as part of the publication's editorial archive, subject to applicable rights and legal requirements.

16. Children's Privacy

THE RESERVE is not intended to knowingly collect personal information from children in circumstances where such collection is prohibited by applicable law.

If you believe that a child has provided personal information to us improperly, please contact us so that we can review the situation and take appropriate action.

17. International Data Transfers

Some service providers used by THE RESERVE may operate infrastructure or process information outside your country.

As a result, information may be processed in jurisdictions other than the country in which you reside.

Where applicable, we seek to use appropriate safeguards for such processing.

18. Security

We continuously work to maintain appropriate security controls around our systems and information.

However, no online service can guarantee absolute security.

If you become aware of a security issue involving THE RESERVE, please contact us promptly rather than attempting to exploit or access systems without authorization.

19. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect changes to our services, technology, legal requirements, or business practices.

When we make material changes, we may update the "Last Updated" date and provide additional notice where appropriate.

Your continued use of THE RESERVE after an updated Privacy Policy becomes effective constitutes acceptance of the updated policy to the extent permitted by applicable law.

20. Contact Us

For questions, requests, or concerns regarding this Privacy Policy or the handling of personal information, please contact THE RESERVE through the official contact information provided on our website.`;

export const TERMS_OF_SERVICE_MARKDOWN = `# TERMS OF SERVICE

**Last Updated: August 22, 2026**

## 1. Acceptance of These Terms

Welcome to **THE RESERVE**.

These Terms of Service ("Terms") govern your access to and use of THE RESERVE website, account features, contributor services, editorial submission tools, social-media publishing tools, and related services.

By accessing or using THE RESERVE, you agree to these Terms.

If you do not agree with these Terms, please do not use the services.

---

## 2. About THE RESERVE

THE RESERVE is a digital editorial and publishing platform.

The platform may publish original editorial work, contributor submissions, photographs, interviews, features, profiles, cultural material, and other content.

Certain users may also be provided with tools for submitting editorial material and managing authorized social-media publishing.

---

## 3. Eligibility

You must be legally capable of entering into these Terms under applicable law to use services that require an account or submission.

If you use THE RESERVE on behalf of another person, organization, brand, or entity, you represent that you have authority to do so.

---

## 4. User Accounts

Certain features may require you to create or maintain an account.

You are responsible for:

- Providing accurate information
- Maintaining the security of your account
- Keeping authentication information confidential
- Not allowing unauthorized individuals to use your account
- Notifying us if you believe your account has been compromised

You are responsible for activity performed through your account to the extent permitted by applicable law.

---

## 5. Google Authentication

THE RESERVE may allow you to sign in using Google authentication.

When using Google authentication, you remain responsible for complying with Google's applicable terms and policies.

You must not use another person's Google account or attempt to circumvent authentication controls.

---

## 6. Contributor Submissions

THE RESERVE may accept submissions from contributors, including:

- Articles
- Written material
- Interviews
- Photographs
- Social-media information
- Editorial ideas
- Other media or supporting material

Submitting material does not guarantee publication.

THE RESERVE may review, edit, reject, modify, delay, or decline to publish submitted material at its editorial discretion, subject to any separate agreement that may apply.

---

## 7. User-Submitted Photos and Content

You are responsible for material that you submit.

You represent and warrant that:

- You own the material or have the necessary rights and permissions to submit it;
- Your submission does not knowingly infringe another person's copyright, trademark, privacy, publicity, or other rights;
- You have obtained appropriate permission from people depicted in photographs where such permission is required;
- Your submission does not knowingly contain unlawful material;
- Your submission does not contain malicious code or other material intended to compromise our systems.

Do not upload material that you are not legally authorized to provide.

---

## 8. Intellectual Property

Unless otherwise stated, THE RESERVE and its licensors retain rights in the website, branding, design, editorial presentation, original articles, photographs, graphics, software, and other proprietary materials belonging to THE RESERVE.

You may not reproduce, redistribute, commercially exploit, modify, or republish protected THE RESERVE material without appropriate authorization.

Third-party trademarks, names, photographs, and other materials remain the property of their respective owners.

---

## 9. Contributor Rights and License

When you submit content to THE RESERVE, you retain ownership of your material unless you have separately agreed otherwise.

However, you grant THE RESERVE the rights reasonably necessary to review, edit, reproduce, publish, display, distribute, promote, archive, and otherwise use the submitted material for the editorial and publishing purposes for which it was submitted.

This may include publication:

- On the THE RESERVE website
- In digital editorial products
- In newsletters
- On official social-media accounts
- Through authorized Instagram publishing
- In promotional materials associated with the publication

The specific rights granted may be further governed by a separate contributor agreement where one exists.

---

## 10. Editorial Use and Editing

THE RESERVE may edit submitted material for:

- Accuracy
- Grammar
- Style
- Length
- Clarity
- Structure
- Editorial consistency
- Publication requirements

Editorial processing may include the use of automated or AI-assisted tools.

AI-assisted processing does not replace THE RESERVE's editorial responsibility or guarantee that every generated statement will be accurate.

THE RESERVE may fact-check, revise, reject, or remove generated or submitted material before publication.

---

## 11. AI-Assisted Editorial Processing

Some THE RESERVE workflows may use artificial intelligence or automated tools to assist with editorial production.

These tools may be used to help create or prepare:

- Headlines
- Subtitles
- Article drafts
- Summaries
- Captions
- Editorial structures
- Social-media copy
- Other publication materials

AI-generated material may contain errors or require editorial correction.

THE RESERVE retains editorial discretion over whether and how such material is published.

---

## 12. Instagram Publishing

Certain authorized users may connect an Instagram account to THE RESERVE and use the platform to publish approved content through Meta's APIs.

By connecting an Instagram account, you authorize THE RESERVE to perform the Instagram actions that you explicitly enable through the applicable authorization process.

You understand that:

- Instagram publishing is dependent on Meta's services;
- Meta may change or restrict its APIs;
- Instagram may reject or modify content;
- Publishing may fail because of technical, policy, authorization, or platform limitations;
- THE RESERVE cannot guarantee uninterrupted Instagram publishing.

You remain responsible for ensuring that the Instagram account and content you authorize for publication comply with applicable Instagram and Meta policies.

---

## 13. Instagram Authorization

You must only connect an Instagram account that you own or are authorized to manage.

You must not:

- Connect another person's account without authorization;
- Attempt to obtain unauthorized access to another account;
- Circumvent Meta's authorization system;
- Use the publishing functionality to distribute content you do not have the right to publish.

You may revoke the application's authorization through the applicable Meta or Instagram controls.

---

## 14. Third-Party Platforms

THE RESERVE may integrate with third-party services, including Google, Meta, Instagram, hosting providers, storage providers, and other technology services.

Those services are controlled by their respective providers.

Your use of third-party services may be subject to separate terms and privacy policies.

THE RESERVE is not responsible for changes, outages, restrictions, or decisions made independently by third-party platforms.

---

## 15. Prohibited Uses

You may not use THE RESERVE to:

- Violate applicable law;
- Infringe intellectual-property rights;
- Submit content you do not have permission to use;
- Impersonate another person or organization;
- Attempt unauthorized access to accounts or systems;
- Circumvent security controls;
- Upload malware or malicious code;
- Abuse automated systems;
- Manipulate or disrupt the service;
- Submit fraudulent information;
- Use another person's social-media account without authorization;
- Use the platform to distribute unlawful or harmful material.

We may restrict or terminate access where we reasonably believe these Terms have been violated.

---

## 16. Accuracy of Information

You are responsible for ensuring that information you provide to THE RESERVE is accurate and current where accuracy is reasonably necessary for the relevant service.

You should not knowingly provide false information about your identity, ownership of submitted material, or authorization to manage an account.

---

## 17. Copyright Complaints

If you believe material published through THE RESERVE infringes your copyright or other intellectual-property rights, please contact us with sufficient information to identify:

- The material in question
- Your ownership or authorization
- The alleged infringement
- The location of the material
- Your contact information
- Any other information reasonably necessary to evaluate the claim

We may review and take appropriate action.

---

## 18. Removal of Content

THE RESERVE may remove or restrict content when we reasonably believe that it:

- Violates these Terms;
- Infringes third-party rights;
- Creates legal or security concerns;
- Violates applicable law;
- Violates platform policies;
- Is materially inaccurate or misleading;
- Is otherwise unsuitable for publication.

Removal of content does not necessarily terminate any separate contractual or legal rights concerning that content.

---

## 19. Availability of the Service

We aim to keep THE RESERVE available and reliable, but we do not guarantee that the service will always be:

- Available
- Uninterrupted
- Error-free
- Free from security vulnerabilities
- Compatible with every device or browser

Maintenance, technical failures, third-party outages, security incidents, and other circumstances may temporarily affect availability.

---

## 20. Third-Party Links

THE RESERVE may contain links to websites, social-media platforms, or other third-party services.

We do not control those services and are not responsible for their content, availability, security, or privacy practices.

You should review the terms and privacy policies of third-party services before using them.

---

## 21. Disclaimer of Warranties

To the extent permitted by applicable law, THE RESERVE and its services are provided on an "as available" basis.

We do not guarantee that all content, services, features, or information will always be accurate, complete, uninterrupted, or suitable for every purpose.

Nothing in these Terms excludes rights or protections that cannot legally be excluded.

---

## 22. Limitation of Liability

To the maximum extent permitted by applicable law, THE RESERVE and its operators, employees, contributors, and service providers will not be liable for indirect, incidental, consequential, special, or punitive damages arising from your use of the service.

This includes, where legally permitted, losses arising from:

- Service interruptions
- Third-party platform failures
- Instagram publishing failures
- Loss of data
- Unauthorized access
- Reliance on published or AI-assisted content
- Loss of business or opportunity

Nothing in these Terms limits liability that cannot legally be limited or excluded.

---

## 23. Indemnification

To the extent permitted by applicable law, you agree to defend and hold THE RESERVE harmless from claims, liabilities, damages, losses, and reasonable expenses arising from:

- Your violation of these Terms;
- Your unlawful use of the service;
- Your submitted content;
- Your infringement of another person's rights;
- Your unauthorized use of a third-party account;
- Your violation of applicable laws or platform policies.

---

## 24. Account Suspension or Termination

We may suspend or terminate an account where reasonably necessary to:

- Protect the service;
- Prevent abuse;
- Address security concerns;
- Investigate violations;
- Comply with legal obligations;
- Enforce these Terms.

You may stop using the service at any time.

Termination does not automatically eliminate rights or obligations that by their nature should survive termination.

---

## 25. Privacy

Our collection and use of personal information is described in our **Privacy Policy**.

By using THE RESERVE, you acknowledge that information may be processed as described in that policy.

---

## 26. Changes to These Terms

We may update these Terms when our services, technology, business practices, or legal requirements change.

We may update the "Last Updated" date when changes are made.

Where appropriate, material changes may be communicated through additional notice.

Your continued use of THE RESERVE after updated Terms become effective constitutes acceptance of those Terms to the extent permitted by applicable law.

---

## 27. Governing Law and Jurisdiction

These Terms shall be governed by the laws of Bangladesh, subject to mandatory rights provided to users under applicable law.

---

## 28. Severability

If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions will continue to apply to the extent permitted by law.

---

## 29. Entire Agreement

These Terms, together with the Privacy Policy and any separate agreements applicable to specific services or contributors, constitute the applicable agreement governing your use of THE RESERVE to the extent permitted by law.

---

## 30. Contact

For questions regarding these Terms, contributor matters, account issues, privacy, or other legal concerns, contact THE RESERVE through the official contact information provided on the website.`;

export const EDITORIAL_POLICY_MARKDOWN = `# EDITORIAL POLICY

THE RESERVE is an independent editorial platform dedicated to people, ideas, culture, style, business, creativity, technology, and the forces shaping contemporary life.

Our editorial policy exists to protect the quality, independence, and credibility of everything we publish.

## Editorial Independence

THE RESERVE maintains editorial independence from advertisers, commercial partners, contributors, sponsors, and other external interests.

Advertising, sponsorship, partnerships, affiliate relationships, or commercial arrangements do not guarantee editorial coverage or influence our editorial decisions.

Our editorial team determines what we publish based on relevance, originality, public interest, cultural significance, and editorial merit.

## Accuracy & Verification

We make reasonable efforts to ensure that factual information published by THE RESERVE is accurate and appropriately sourced.

Depending on the nature of a story, our editorial process may involve reviewing:

- Original interviews
- Official statements
- Public records
- Reputable publications
- Institutional sources
- Primary source materials
- Contributor submissions
- Other verifiable public information

Where appropriate, claims, quotations, statistics, dates, names, and other material facts are checked before publication.

However, THE RESERVE does not guarantee that every piece of information published will remain accurate or complete at all times. Information may change after publication, and errors may occasionally occur.

## Corrections

If we identify a material factual error, we will make a correction where appropriate.

Corrections may be made directly to an article, accompanied by an editorial note when the nature of the correction warrants one.

We encourage readers to report factual errors or significant inaccuracies to our editorial team.

## Sources & Attribution

THE RESERVE respects the work of journalists, photographers, writers, researchers, publications, institutions, and other original creators.

Material obtained from external sources will be appropriately attributed where required.

We do not knowingly present another person's original work as our own.

When an article is based substantially on information reported elsewhere, the relevant source may be identified within the article.

## Original Editorial Work

THE RESERVE may commission, produce, edit, adapt, or independently develop editorial content.

Editorial content may include:

- Features
- Profiles
- Interviews
- Essays
- Commentary
- Cultural coverage
- Fashion and lifestyle stories
- Business and technology coverage
- Visual stories
- Contributor submissions

All submitted material remains subject to editorial review and may be edited for accuracy, clarity, length, structure, style, grammar, and publication standards.

## Artificial Intelligence & Editorial Production

THE RESERVE may use artificial intelligence-assisted tools in parts of its editorial workflow, including research organization, summarization, drafting assistance, translation, editing, formatting, metadata generation, and content production.

AI-assisted material is not automatically considered publication-ready.

Editorial material remains subject to human editorial review, fact-checking, quality control, and approval before publication.

AI tools are not treated as authoritative sources, and THE RESERVE does not knowingly publish fabricated information as fact.

## Editorial Tone

THE RESERVE aims to produce intelligent, distinctive, visually considered, and accessible journalism and editorial storytelling.

We value:

- Accuracy over sensationalism.
- Substance over noise.
- Originality over imitation.
- Context over clickbait.
- Editorial judgment over commercial pressure.

## Conflicts of Interest

Editors, writers, contributors, and other participants in editorial production are expected to disclose relevant conflicts of interest where such conflicts could reasonably affect editorial judgment.

THE RESERVE may decline or modify coverage where a conflict creates a significant concern regarding editorial independence.

## Sponsored & Commercial Content

Commercially sponsored material will be distinguished from independent editorial content.

Advertisers and commercial partners do not receive editorial control over independent stories.

Where appropriate, sponsored content will carry clear labeling such as Sponsored, Partner Content, Advertisement, or another suitable designation.

## Right to Edit or Decline

THE RESERVE reserves the editorial right to:

- Edit submitted material
- Request clarification or additional information
- Reject submissions
- Remove content that violates our standards
- Update previously published material
- Correct factual errors
- Remove material where publication creates legitimate legal, ethical, or safety concerns

## Our Standard

THE RESERVE seeks to build a publication that readers can trust for its judgment, originality, and integrity.

Our editorial policy may evolve as the publication develops.

*Last updated: August 2026*`;

export const ADVERTISING_MARKDOWN = `# ADVERTISING & PARTNERSHIPS

THE RESERVE works with brands, organizations, institutions, and businesses that share an interest in reaching an engaged audience interested in culture, fashion, business, technology, creativity, lifestyle, and contemporary ideas.

We offer carefully considered advertising and partnership opportunities while maintaining a clear distinction between commercial activity and independent editorial judgment.

## Advertising Opportunities

Depending on availability, THE RESERVE may offer:

- Digital display advertising
- Brand campaigns
- Sponsored features
- Partner content
- Branded editorial projects
- Social media campaigns
- Event partnerships
- Product or service features
- Special issues and thematic campaigns
- Custom editorial collaborations

Available formats, specifications, pricing, and placement options may vary.

## Editorial Independence

Advertising does not guarantee editorial coverage.

Advertisers and commercial partners cannot purchase favorable independent editorial treatment.

Our editorial team retains responsibility for determining whether, how, and when independent editorial content is published.

## Sponsored Content

Sponsored or commercially commissioned content will be identified appropriately.

Sponsored content may be produced in collaboration with a brand or organization, but it must still comply with THE RESERVE's applicable editorial, legal, and content standards.

## Advertising Standards

THE RESERVE reserves the right to reject, remove, or modify advertisements that we believe:

- Are misleading or deceptive
- Make unsupported claims
- Violate applicable law
- Infringe intellectual property rights
- Contain offensive or inappropriate material
- Promote illegal activities
- Misrepresent products, services, or organizations
- Conflict materially with our publication standards

Acceptance of an advertisement does not constitute endorsement of the advertiser, its products, or its claims.

## Brand Partnerships

We may collaborate with brands and organizations on special editorial or creative projects.

Such partnerships will be structured so that the commercial nature of the relationship is appropriately disclosed where required.

## Advertising Materials

Advertisers and partners are responsible for ensuring that materials supplied to THE RESERVE:

- Are accurate
- Are lawful
- Do not infringe third-party rights
- Do not contain unauthorized copyrighted material
- Do not violate applicable advertising regulations

The advertiser or partner remains responsible for claims made in its advertising materials.

## Contact

For advertising, sponsorship, partnership, or commercial collaboration inquiries, please contact THE RESERVE through the official contact channel provided on this website.

*Last updated: August 2026*`;

export const LEGAL_MARKDOWN = `# LEGAL

This page provides general legal information governing the use of THE RESERVE website and its content.

By accessing or using this website, you acknowledge and agree to comply with the applicable policies, terms, and notices published by THE RESERVE.

## Website Ownership

Unless otherwise stated, the website, its design, branding, editorial presentation, original text, graphics, photographs, videos, logos, trademarks, software, and other materials are owned by or licensed to THE RESERVE Magazine Group or its respective rights holders.

All rights reserved.

## Copyright

Original content published by THE RESERVE may not be reproduced, republished, distributed, modified, transmitted, sold, or commercially exploited without prior written permission from the relevant rights holder, except where permitted by applicable law.

Limited quotations or references for purposes such as criticism, commentary, reporting, research, or review may be permitted where legally applicable and where appropriate attribution is provided.

## Third-Party Content

THE RESERVE may publish or display material supplied by contributors, photographers, agencies, partners, public sources, or other third parties.

Ownership of third-party material remains with its respective rights holder unless otherwise agreed.

The appearance of third-party material on THE RESERVE does not necessarily imply endorsement by THE RESERVE.

## User & Contributor Submissions

If you submit photographs, articles, videos, information, social media links, or other material to THE RESERVE, you represent that:

- You have the necessary rights or permissions to submit the material.
- The material does not knowingly infringe another person's rights.
- The information you provide is accurate to the best of your knowledge.
- You have obtained any necessary permissions concerning identifiable individuals appearing in submitted material.

By submitting material, you grant THE RESERVE the rights necessary to review, edit, reproduce, publish, distribute, display, archive, and promote the submitted material in connection with THE RESERVE, subject to the applicable contributor agreement or submission terms.

## Trademarks

THE RESERVE and its associated names, logos, marks, visual identities, and branding elements may constitute trademarks or protected identifiers.

Nothing on this website grants any person a license to use such marks without prior written permission.

## External Links

THE RESERVE may provide links to websites, platforms, publications, social media accounts, or other third-party services.

THE RESERVE does not control those external websites and is not responsible for their content, security, availability, privacy practices, or policies.

Users should review the applicable policies of external services before interacting with them.

## Third-Party Platforms

THE RESERVE may use third-party platforms and services, including social media, authentication providers, hosting services, analytics services, content delivery services, and application programming interfaces.

Use of such services may be subject to the terms and privacy policies of those respective providers.

## No Warranty

THE RESERVE makes reasonable efforts to maintain the website and its content but does not guarantee that:

- The website will always be available;
- All information will always be complete or current;
- The website will be free from errors;
- Third-party services will remain available; or
- The website will always operate without interruption.

Use of the website is at the user's own discretion and risk to the extent permitted by applicable law.

## Limitation of Responsibility

Nothing on THE RESERVE should be interpreted as professional legal, financial, medical, investment, or other specialized advice unless expressly identified as such.

Readers should seek appropriate professional advice before making decisions based on information published on the website.

To the maximum extent permitted by applicable law, THE RESERVE shall not be responsible for losses arising from reliance on general editorial information published on the website.

## Privacy

THE RESERVE collects and processes certain information in connection with website operation, contributor submissions, user accounts, authentication, communications, and other services.

Our collection and handling of personal information is described in our Privacy Policy.

## Terms of Service

Use of the website is also governed by our Terms of Service.

## Policy Changes

THE RESERVE may update this Legal page and other website policies from time to time.

Changes become effective when published on this website unless otherwise stated.

## Contact

For copyright, legal, licensing, permissions, or other legal inquiries, please contact THE RESERVE through the official contact channel provided on this website.`;

// Static intro/philosophy portion only -- stops after "Our Philosophy".
// See this file's header comment for why the "Board Members" section and
// its bracketed placeholder entries are deliberately not included here.
export const EDITORIAL_BOARD_INTRO_MARKDOWN = `# EDITORIAL BOARD

The Editorial Board of THE RESERVE provides strategic editorial oversight and helps protect the publication's standards, identity, and long-term direction.

The board represents the publication's commitment to thoughtful journalism, cultural relevance, editorial independence, and responsible publishing.

## Our Role

The Editorial Board may contribute to:

- Editorial direction
- Publication standards
- Long-term editorial strategy
- Quality and integrity standards
- Major editorial initiatives
- Special projects and issues
- Standards concerning corrections and editorial accountability
- Development of THE RESERVE's voice and identity

## Editorial Independence

The Editorial Board operates independently from commercial advertising decisions.

Commercial relationships do not determine editorial appointments, coverage decisions, or editorial positions.

## Editorial Responsibility

While individual editors, writers, contributors, and creative professionals may be responsible for specific pieces of content, the Editorial Board helps establish the broader standards under which THE RESERVE operates.

## Our Philosophy

THE RESERVE believes that a modern publication should do more than report what is happening.

It should examine why it matters.

Our editorial approach is built around curiosity, context, strong storytelling, visual intelligence, and respect for the audience.

We seek voices that challenge assumptions, introduce new perspectives, document meaningful work, and contribute something valuable to the cultural conversation.`;
