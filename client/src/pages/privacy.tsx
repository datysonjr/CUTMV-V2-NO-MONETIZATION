/*
 * © 2025 Full Digital LLC. All Rights Reserved.
 * CUTMV - Music Video Cut-Down Tool
 * Proprietary software - unauthorized use prohibited
 */

import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import fdLogo from "@/assets/fd-logo.png";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-brand-black border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/">
              <Button variant="ghost" className="text-white hover:text-brand-green">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to CUTMV
              </Button>
            </Link>
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-white mr-4">CUTMV</h1>
              <img src={fdLogo} alt="Full Digital" className="h-8 w-8" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="bg-white dark:bg-gray-900">
          <CardHeader>
            <CardTitle className="text-3xl font-bold text-center">Privacy Policy</CardTitle>
            <p className="text-center text-gray-600 dark:text-gray-400">
              Effective Date: January 18, 2025
            </p>
          </CardHeader>
          <CardContent className="prose prose-gray dark:prose-invert max-w-none">
            <p className="lead">
              Your privacy is important to us. This Privacy Policy outlines how Full Digital LLC collects, uses, and protects your information when you use CUTMV.
            </p>

            <h2>1. INFORMATION WE COLLECT</h2>
            
            <h3>1.1 Information You Provide</h3>
            <p>We may collect the following information when you use CUTMV:</p>
            <ul>
              <li><strong>Contact Information:</strong> Email address (optional, for account creation or notifications)</li>
              <li><strong>Payment Information:</strong> Processed securely by third-party payment providers (we do not store payment details)</li>
              <li><strong>Video Content:</strong> Files you upload for processing (temporarily stored and automatically deleted)</li>
              <li><strong>Processing Preferences:</strong> Your selected settings, timestamps, and export options</li>
            </ul>

            <h3>1.2 Automatically Collected Information</h3>
            <p>We may automatically collect:</p>
            <ul>
              <li><strong>Usage Data:</strong> Number of exports, processing time, feature usage</li>
              <li><strong>Technical Data:</strong> IP address, browser type, device information</li>
              <li><strong>Performance Metrics:</strong> Upload speeds, processing success rates, error logs</li>
              <li><strong>File Metadata:</strong> Video duration, resolution, format (not the actual content)</li>
            </ul>

            <h2>2. HOW WE USE YOUR INFORMATION</h2>
            
            <p>We use collected information for the following purposes:</p>
            
            <h3>2.1 Service Provision</h3>
            <ul>
              <li>Process your video uploads and generate exports</li>
              <li>Provide customer support and technical assistance</li>
              <li>Manage payments and billing</li>
              <li>Deliver requested features and functionality</li>
            </ul>

            <h3>2.2 Service Improvement</h3>
            <ul>
              <li>Analyze usage trends to improve performance</li>
              <li>Develop new features based on user needs</li>
              <li>Optimize processing algorithms and workflows</li>
              <li>Monitor system security and prevent abuse</li>
            </ul>

            <h3>2.3 Communication</h3>
            <ul>
              <li>Send essential service updates and notifications</li>
              <li>Respond to your inquiries and support requests</li>
              <li>Notify you of important changes to our services</li>
              <li>Provide information about new features (if opted in)</li>
            </ul>

            <h2>3. INFORMATION SHARING AND DISCLOSURE</h2>
            
            <p>We do not sell, trade, or otherwise transfer your personal information to third parties, except in the following circumstances:</p>

            <h3>3.1 Service Providers</h3>
            <p>We may share information with trusted third-party service providers who assist us in:</p>
            <ul>
              <li>Payment processing (Stripe, PayPal, etc.)</li>
              <li>Cloud hosting and data storage</li>
              <li>Analytics and performance monitoring</li>
              <li>Customer support platforms</li>
            </ul>

            <h3>3.2 Legal Requirements</h3>
            <p>We may disclose information when required by law or to:</p>
            <ul>
              <li>Comply with legal processes or government requests</li>
              <li>Protect our rights, property, or safety</li>
              <li>Prevent fraud or investigate security issues</li>
              <li>Enforce our Terms of Service</li>
            </ul>

            <h2>4. DATA SECURITY AND RETENTION</h2>
            
            <h3>4.1 Security Measures</h3>
            <p>We implement industry-standard security measures including:</p>
            <ul>
              <li>Encryption of data in transit and at rest</li>
              <li>Secure file processing in isolated environments</li>
              <li>Regular security audits and monitoring</li>
              <li>Access controls and authentication systems</li>
              <li>Automated threat detection and response</li>
            </ul>

            <h3>4.2 Data Retention</h3>
            <p>We retain information only as long as necessary:</p>
            <ul>
              <li><strong>Uploaded Videos:</strong> Automatically deleted after 24 hours</li>
              <li><strong>Generated Exports:</strong> Available for download for 48 hours, then deleted</li>
              <li><strong>Processing Metadata:</strong> Retained for 30 days for support purposes</li>
              <li><strong>Usage Analytics:</strong> Aggregated and anonymized, retained for service improvement</li>
              <li><strong>Account Information:</strong> Retained until account deletion is requested</li>
            </ul>

            <h2>5. COOKIES AND TRACKING TECHNOLOGIES</h2>
            
            <p>We use cookies and similar technologies to:</p>
            <ul>
              <li>Remember your preferences and settings</li>
              <li>Analyze website traffic and usage patterns</li>
              <li>Improve user experience and performance</li>
              <li>Provide personalized features</li>
            </ul>
            
            <p>You can control cookie settings through your browser preferences. Note that disabling cookies may affect some functionality.</p>

            <h2>6. THIRD-PARTY SERVICES</h2>
            
            <p>CUTMV integrates with third-party services that have their own privacy policies:</p>
            
            <h3>6.1 Payment Processors</h3>
            <ul>
              <li>Stripe: <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-green">Privacy Policy</a></li>
              <li>PayPal: <a href="https://www.paypal.com/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-green">Privacy Policy</a></li>
            </ul>

            <h3>6.2 Hosting and Infrastructure</h3>
            <ul>
              <li>Cloud hosting providers for secure file processing</li>
              <li>Content delivery networks for optimal performance</li>
              <li>Analytics services for usage monitoring</li>
            </ul>

            <h2>7. YOUR PRIVACY RIGHTS</h2>
            
            <p>You have the following rights regarding your personal information:</p>

            <h3>7.1 Access and Portability</h3>
            <ul>
              <li>Request a copy of the personal information we hold about you</li>
              <li>Receive your data in a structured, machine-readable format</li>
            </ul>

            <h3>7.2 Correction and Deletion</h3>
            <ul>
              <li>Correct inaccurate or incomplete personal information</li>
              <li>Request deletion of your personal information</li>
              <li>Withdraw consent for optional data processing</li>
            </ul>

            <h3>7.3 Communication Preferences</h3>
            <ul>
              <li>Opt out of non-essential communications</li>
              <li>Update your contact preferences</li>
              <li>Unsubscribe from marketing emails</li>
            </ul>

            <p>To exercise these rights, contact us at privacy@fulldigitalll.com</p>

            <h2>8. CHILDREN'S PRIVACY</h2>
            
            <p>CUTMV is not intended for use by children under 18 years of age. We do not knowingly collect personal information from children. If we become aware that we have collected information from a child under 18, we will delete it immediately.</p>

            <h2>9. INTERNATIONAL DATA TRANSFERS</h2>
            
            <p>Your information may be processed in countries other than your country of residence. We ensure appropriate safeguards are in place to protect your information during international transfers.</p>

            <h2>10. CALIFORNIA PRIVACY RIGHTS</h2>
            
            <p>California residents have additional rights under the California Consumer Privacy Act (CCPA):</p>
            <ul>
              <li>Right to know what personal information is collected</li>
              <li>Right to delete personal information</li>
              <li>Right to opt-out of the sale of personal information (we do not sell information)</li>
              <li>Right to non-discrimination for exercising privacy rights</li>
            </ul>

            <h2>11. CHANGES TO THIS PRIVACY POLICY</h2>
            
            <p>We may update this Privacy Policy to reflect changes in our practices or legal requirements. We will notify you of material changes through:</p>
            <ul>
              <li>Email notification (if you have provided an email address)</li>
              <li>Prominent notice on our website</li>
              <li>In-app notifications when you next use the service</li>
            </ul>
            
            <p>We encourage you to review this policy periodically.</p>

            <h2>12. CONTACT INFORMATION</h2>
            
            <p>For questions about this Privacy Policy or to exercise your privacy rights, contact us:</p>
            <ul>
              <li><strong>Email:</strong> privacy@fulldigitalll.com</li>
              <li><strong>Website:</strong> <a href="https://www.fulldigitalll.com" target="_blank" rel="noopener noreferrer" className="text-brand-green hover:text-brand-green-light">fulldigitalll.com</a></li>
              <li><strong>Mail:</strong> Full Digital LLC, Privacy Department</li>
            </ul>

            <div className="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This Privacy Policy was last updated on January 18, 2025. Your continued use of CUTMV after any changes indicates your acceptance of the updated policy.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="bg-brand-black border-t border-gray-800 mt-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-center">
            <div className="flex items-center text-gray-300">
              <span className="text-sm">Powered by</span>
              <img src={fdLogo} alt="Full Digital" className="h-6 w-6 mx-2" />
              <a 
                href="https://www.fulldigitalll.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-brand-green hover:text-brand-green-light transition-colors text-sm font-medium"
              >
                Full Digital
              </a>
            </div>
          </div>
          <div className="text-center mt-2">
            <p className="text-xs text-gray-400">
              Multi-Platinum Design Agency - Artwork, Animation, AR Filters, Visualizers, Websites & More
            </p>
            <p className="text-xs text-gray-500 mt-1 border-t border-gray-800 pt-2">
              © 2025 Full Digital LLC. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}