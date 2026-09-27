import { PageTransition } from '@/components/motion/PageTransition';
import { HeroSection } from '@/components/landing/HeroSection';
import { WhySection } from '@/components/landing/WhySection';
import { HowSection } from '@/components/landing/HowSection';
import { ServicesSection } from '@/components/landing/ServicesSection';
import { PartnersSection } from '@/components/landing/PartnersSection';
import { SiteFooter } from '@/components/landing/SiteFooter';

export function LandingPage() {
  return (
    <PageTransition>
      <HeroSection />
      <WhySection />
      <HowSection />
      <ServicesSection />
      <PartnersSection />
      <SiteFooter />
    </PageTransition>
  );
}
