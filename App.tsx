import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Breadcrumbs from './components/Breadcrumbs';
import CookieConsent from './components/CookieConsent';
import { trackPageView } from './lib/analytics';
import { loadAnalytics, hasConsent } from './lib/analytics-loader';
import routeMeta from './lib/route-meta.json';

// Lazy load all pages for code splitting
const Home = lazy(() => import('./pages/Home'));
const Services = lazy(() => import('./pages/Services'));
const Volunteer = lazy(() => import('./pages/Volunteer'));
const Gruhp = lazy(() => import('./pages/Gruhp'));
const Partners = lazy(() => import('./pages/Partners'));
const CommonCloud = lazy(() => import('./pages/CommonCloud'));
const About = lazy(() => import('./pages/About'));
const MatchingGifts = lazy(() => import('./pages/MatchingGifts'));
const FAQ = lazy(() => import('./pages/FAQ'));
const Contact = lazy(() => import('./pages/Contact'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

// Page title mapping for analytics
const pageTitles: Record<string, string> = {
  '/': 'Home',
  '/services': 'Services',
  '/volunteer': 'Volunteer',
  '/gruhp': 'GRUHP Fund',
  '/corporate-partners': 'Corporate Partners',
  '/common-cloud': 'Common Cloud',
  '/about': 'About',
  '/matching-gifts': 'Matching Gifts',
  '/faq': 'FAQ',
  '/contact': 'Contact',
  '/privacy': 'Privacy Policy',
  '/terms': 'Terms of Service',
};

// Keep head tags in sync on client-side navigation (prerendered HTML sets them on first load)
const setHeadForRoute = (pathname: string) => {
  const meta = (routeMeta as Record<string, { title: string; description: string }>)[pathname];
  if (!meta) return;
  const url = `https://gifteddreamers.org${pathname}`;
  document.title = meta.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description);
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', url);
  document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
};

const ScrollToTop = () => {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo(0, 0);
    setHeadForRoute(pathname);
    // Track page view for GA4
    const pageTitle = pageTitles[pathname] || 'Gifted Dreamers';
    trackPageView(pathname, pageTitle);
  }, [pathname]);
  return null;
};

const App: React.FC = () => {
  // DO NOT load analytics automatically - wait for explicit user consent
  // Analytics will only load when user clicks "Accept" in cookie banner
  // This prevents third-party cookies from being set without consent
  // Removed automatic loading to ensure privacy compliance
  React.useEffect(() => {
    // No automatic loading - wait for user to accept cookies
  }, []);

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ScrollToTop />
      <div className="flex flex-col min-h-screen bg-white font-sans text-slate-900">
        {/* Skip link for accessibility - hidden until focused */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-white focus:rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
        >
          Skip to main content
        </a>
        <Navbar />
        
        {/* Conditional Breadcrumbs handled inside Breadcrumbs component via generic check, 
            but for cleaner separation we can also conditionally render the component here.
            The Breadcrumbs component implementation handles checking if path is home.
        */}
        <Breadcrumbs />

        <main id="main-content" className="flex-grow">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/services" element={<Services />} />
              <Route path="/volunteer" element={<Volunteer />} />
              <Route path="/gruhp" element={<Gruhp />} />
              <Route path="/corporate-partners" element={<Partners />} />
              <Route path="/common-cloud" element={<CommonCloud />} />
              
              {/* Compliance & Footer Pages */}
              <Route path="/about" element={<About />} />
              <Route path="/matching-gifts" element={<MatchingGifts />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
            </Routes>
          </Suspense>
        </main>
        <Footer />
        <CookieConsent 
          onAccept={loadAnalytics}
          onDecline={() => {
            // User declined - analytics won't load
            // This is handled by the analytics-loader not loading scripts
          }}
        />
      </div>
    </Router>
  );
};

export default App;