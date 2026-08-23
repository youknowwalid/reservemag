import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { legalMarkdownComponents } from '../components/legal/legalMarkdownComponents';
import { EDITORIAL_BOARD_INTRO_MARKDOWN } from './legal/legalContent';
import { editorialBoardService } from '../services/editorialBoardService';
import { deriveEditorialBoardView } from '../lib/editorialBoardView';
import { EditorialBoardMember } from '../types';

// Public, unauthenticated -- same shell as the other footer pages, but
// unlike them this one is NOT fully static: the "Board Members" section
// below the (static, verbatim) intro/philosophy text is pulled live from
// the admin-managed editorial_board_members table, in display order.
// Zero members shows a clean empty state -- the bracketed
// [NAME]/[TITLE/ROLE]/[bio] placeholder text from the brief is never
// hardcoded or rendered here under any circumstance; see
// deriveEditorialBoardView's doc comment (lib/editorialBoardView.ts).
export default function EditorialBoardPage() {
  const [members, setMembers] = useState<EditorialBoardMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    editorialBoardService.getAllMembers().then((m) => {
      setMembers(m);
      setLoading(false);
    });
  }, []);

  const view = deriveEditorialBoardView(members);

  return (
    <div className="bg-reserve-bg min-h-screen text-reserve-text">
      <Navbar />
      <div className="max-w-3xl mx-auto px-6 py-32 space-y-6">
        <ReactMarkdown components={legalMarkdownComponents}>{EDITORIAL_BOARD_INTRO_MARKDOWN}</ReactMarkdown>

        <h2 className="text-2xl font-serif text-white pt-8">Board Members</h2>

        {loading ? (
          <p className="text-zinc-500 text-sm">Loading...</p>
        ) : view.kind === 'empty' ? (
          <p className="text-zinc-400 leading-relaxed">
            The Editorial Board section will be updated as appointments are formally established.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-8 pt-2">
            {view.members.map((member) => (
              <div key={member.id} className="flex gap-5 bg-zinc-950 border border-white/5 p-6">
                {member.photoUrl ? (
                  <img
                    src={member.photoUrl}
                    alt={member.name}
                    className="w-20 h-20 object-cover border border-white/10 shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 bg-zinc-900 border border-white/10 shrink-0 flex items-center justify-center text-zinc-600 font-serif text-2xl uppercase">
                    {member.name.charAt(0)}
                  </div>
                )}
                <div className="space-y-1 min-w-0">
                  <h3 className="font-serif text-lg text-white">{member.name}</h3>
                  <p className="text-[10px] uppercase tracking-widest text-reserve-accent">{member.title}</p>
                  {member.bio && <p className="text-sm text-zinc-400 leading-relaxed pt-1">{member.bio}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] uppercase tracking-widest text-zinc-600 pt-8">Last updated: August 2026</p>
      </div>
      <Footer />
    </div>
  );
}
