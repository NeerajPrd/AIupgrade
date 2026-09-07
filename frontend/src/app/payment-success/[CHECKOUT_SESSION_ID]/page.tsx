'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Loader2, Mail, XCircle } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';

interface PaymentData {
  status: string;
  data?: any;
  error?: string;
}

const PaymentSuccess: React.FC = () => {
  const router = useRouter();
  const {CHECKOUT_SESSION_ID} = useParams<{ CHECKOUT_SESSION_ID: string }>();
  const [paymentStatus, setPaymentStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [paymentData, setPaymentData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    const verifyPayment = async () => {
      console.log(CHECKOUT_SESSION_ID)
      if (!CHECKOUT_SESSION_ID) {
        setPaymentStatus('error');
        setError('Invalid payment session');
        return;
      }

      try {
        const getCookie = (name: string): string | null => {
          if (typeof document === 'undefined') return null;
          const match = document.cookie.match(new RegExp(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`));
          return match ? match[2] : null;
        };
        const token = getCookie("jwt") || (typeof window !== 'undefined' ? localStorage.getItem('upgrade-token') : null) || "";

        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8004";
        const response = await fetch(`${API_BASE_URL}/api/v1/payment/complete-checkout-session/${CHECKOUT_SESSION_ID}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        
        const data: PaymentData = await response.json();

        if (data.status === 'success') {
          setPaymentStatus('success');
          setPaymentData(data.data);
        } else {
          setPaymentStatus('error');
          setError('Payment verification failed');
        }
      } catch (err) {
        setPaymentStatus('error');
        setError('Unable to verify payment. Please contact support.');
      }
    };

    verifyPayment();
  }, [CHECKOUT_SESSION_ID]);


  const renderContent = () => {
    const contentVariants = {
      initial: { opacity: 0, y: 50 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -50 }
    };

    const iconVariants = {
      initial: { scale: 0 },
      animate: { 
        scale: 1,
        transition: {
          type: "spring",
          stiffness: 260,
          damping: 20
        }
      }
    };

    switch (paymentStatus) {
      case 'loading':
        return (
          <motion.div
            className="text-center"
            initial="initial"
            animate="animate"
            variants={contentVariants}
          >
            <motion.div 
              className="flex justify-center"
              variants={iconVariants}
            >
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
            </motion.div>
            <div className="mt-6">
              <p className="text-xl font-semibold">Verifying your payment...</p>
              <p className="mt-2 text-gray-600">Please wait while we process your transaction.</p>
            </div>
          </motion.div>
        );

      case 'success':
        return (
          <motion.div
            className="text-center"
            initial="initial"
            animate="animate"
            variants={contentVariants}
          >
            <motion.div 
              className="flex justify-center"
              variants={iconVariants}
            >
              <CheckCircle className="w-16 h-16 text-green-500" />
            </motion.div>
            <div className="mt-6">
              <h2 className="text-2xl font-bold">Payment Successful!</h2>
              {paymentData?.updatedPurchase && (
                <motion.div 
                  className="mt-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <p className="text-gray-600">
                    You have received {paymentData.updatedPurchase.token} tokens
                  </p>
                  {/* <p className="text-sm text-gray-500 mt-2">
                    Transaction ID: <span className='text-[9px] md:text-sm'>{paymentData.updatedPayment.transactionId}</span>
                  </p> */}
                </motion.div>
              )}
              <motion.button
                onClick={()=>router.push('/')}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="mt-6 text-sm text-gray-500"
              >
                Return to Home page
              </motion.button>
            </div>
          </motion.div>
        );

      case 'error':
        return (
          <motion.div
            className="text-center"
            initial="initial"
            animate="animate"
            variants={contentVariants}
          >
            <motion.div 
              className="flex justify-center"
              variants={iconVariants}
            >
              <XCircle className="w-16 h-16 text-red-500" />
            </motion.div>
            <div className="mt-6">
              <h2 className="text-2xl font-bold">Payment Failed</h2>
              <p className="text-red-500 mt-4">{error}</p>
              <motion.div 
                className="mt-8 space-x-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <button 
                  onClick={() => router.push('/checkout')}
                  className="bg-gray-500 text-white px-6 py-2 rounded-full hover:bg-gray-600 transition-colors"
                >
                  Try Again
                </button>
                <button 
                  onClick={() => window.location.href = 'mailto:connect@fagoondigital.com'}
                  className="bg-blue-500 text-white px-6 py-2 rounded-full hover:bg-blue-600 transition-colors inline-flex items-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  Contact Support
                </button>
              </motion.div>
            </div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md md:max-w-2xl bg-transparent">
        <CardContent className="pt-6">
          {renderContent()}
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSuccess