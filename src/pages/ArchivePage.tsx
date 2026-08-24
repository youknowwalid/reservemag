import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ArticleListing from '../components/ArticleListing';

// audit NAV-04: the footer's "Digital Archive" link (Footer.tsx, and the
// mobile menu's own "Archive" link in Navbar.tsx) already pointed at
// /archive -- it just had no route behind it, so it 404'd server-side and
// silently bounced to "/" client-side. This is that destination: every
// published article, unfiltered, newest first. (<title>/meta live inside
// ArticleListing -- see its doc comment for why they can't render here.)
export default function ArchivePage() {
  return (
    <div className="bg-reserve-bg min-h-screen text-reserve-text">
      <Navbar />
      <ArticleListing
        eyebrow="The Full Collection"
        title="Digital Archive"
        metaDescription="Every published story from THE RESERVE, newest first."
      />
      <Footer />
    </div>
  );
}
