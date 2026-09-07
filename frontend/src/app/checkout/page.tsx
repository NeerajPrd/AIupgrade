'use client'

import React, { useState, ChangeEvent, FormEvent, useEffect, Suspense } from 'react';
import { showErrorToast } from "@/utils/toast";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { CreditCard, DollarSign, Package, Hash, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import LoadingPage from '../loading';

interface FormData {
  product_name: string;
  unit_amount: string;
  currency: string;
  payment_method: string;
  quantity: number;
}

const CheckoutPage: React.FC = () => {
  return (
    <Suspense fallback={<LoadingPage />}>
      <CheckoutContent />
    </Suspense>
  );
};

const CheckoutContent: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    product_name: '',
    unit_amount: '',
    currency: 'usd',
    payment_method: 'card',
    quantity: 1,
  });
  const [jwtToken, setJwtToken] = useState<string | null>();
  const [showMobileSummary, setShowMobileSummary] = useState(false);

  useEffect(() => {
    const getCookie = (name: string): string | null => {
      const match = document.cookie.match(`(^|;)\\s*${name}\\s*=\\s*([^;]+)`);
      return match ? match[2] : null;
    };

    const jwt = getCookie("jwt");
    setJwtToken(jwt);
  }, []);
  const searchParams = useSearchParams();
  const product = searchParams.get('product');


  useEffect(() => {
    if (product === 'enterprise') {
      setFormData({
        product_name: 'Enterprise Content Intelligence',
        unit_amount: '29900',
        currency: 'usd',
        payment_method: 'card',
        quantity: 1,
      });
    }
    else if (product === 'neural') {
      setFormData({
        product_name: 'Neural Analytics Suite',
        unit_amount: '49900',
        currency: 'usd',
        payment_method: 'card',
        quantity: 1,
      });
    }
    else if (product === 'quantum') {
      setFormData({
        product_name: 'Quantam Support Intelligence',
        unit_amount: '39900',
        currency: 'usd',
        payment_method: 'card',
        quantity: 1,
      });
    }
    else {
      setFormData({
        product_name: '',
        unit_amount: '',
        currency: 'usd',
        payment_method: 'card',
        quantity: 1,
      })
    }
  }, [product]);



  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    try {
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8004";
      const response = await fetch(`${API_BASE_URL}/api/v1/payment/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jwtToken}`
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Payment failed');
      }

      window.location.href = data.url;
    } catch (error) {
      if (error instanceof Error) {
        showErrorToast(error.message);
      } else {
        showErrorToast('An unknown error occurred');
      }
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prevState) => ({
      ...prevState,
      [name]: name === 'quantity' || name === 'unit_amount' ? Number(value) : value,
    }));
  };

  const totalAmount = Number(formData.unit_amount) * formData.quantity / 100;

  const OrderSummary = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="font-medium">{formData.product_name || 'Product Name'}</p>
          <p className="text-sm text-gray-500">Quantity: {formData.quantity}</p>
        </div>
        <p className="font-medium">${totalAmount.toFixed(2)}</p>
      </div>

      <div className="border-t pt-4">
        <div className="flex justify-between items-center">
          <p className="text-gray-600">Discounts & Offers</p>
          <p>$0.00</p>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <p className="text-gray-600">Tax</p>
        <p>$0.00</p>
      </div>

      <div className="border-t pt-4">
        <div className="flex justify-between items-center font-bold">
          <p>Total</p>
          <p>${totalAmount.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-6">
        <Card className="flex-1">
          <CardHeader className="relative">
            <CardTitle className="text-2xl font-bold">Let's Make Payment</CardTitle>
            <p className="text-sm text-gray-500 mt-2">
              To start your subscription, input your card details to make payment.
              You will be redirected to your bank's authorization page.
            </p>
          </CardHeader>
          <CardContent>
            <div className="lg:hidden mb-6">
              <button
                onClick={() => setShowMobileSummary(!showMobileSummary)}
                className="w-full flex items-center justify-between p-4 bg-gray-100 dark:bg-gray-800 rounded-lg"
              >
                <span className="font-medium">Order Summary (${totalAmount.toFixed(2)})</span>
                {showMobileSummary ? (
                  <ChevronUp className="w-5 h-5" />
                ) : (
                  <ChevronDown className="w-5 h-5" />
                )}
              </button>
              {showMobileSummary && (
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <OrderSummary />
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="relative">
                  <label className="block text-sm font-medium mb-2">
                    <span className="flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Product Name
                    </span>
                  </label>
                  <input
                    type="text"
                    disabled
                    name="product_name"
                    value={formData.product_name}
                    onChange={handleInputChange}
                    className="w-full p-3 border rounded-lg bg-white/5 shadow-sm focus:ring-2"
                    required
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              >
                <div className="relative">
                  <label className="block text-sm font-medium mb-2">
                    <span className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      Price (in cents)
                    </span>
                  </label>
                  <input
                    type="number"
                    name="unit_amount"
                    disabled
                    value={formData.unit_amount}
                    onChange={handleInputChange}
                    className="w-full p-3 border rounded-lg bg-white/5 shadow-sm focus:ring-2"
                    min="0"
                    required
                  />
                </div>
              </motion.div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.2 }}
                >
                  <div className="relative">
                    <label className="block text-sm font-medium mb-2">
                      <span className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        Currency
                      </span>
                    </label>
                    <select
                      name="currency"
                      value={formData.currency}
                      onChange={handleInputChange}
                      className="w-full p-3 border rounded-lg bg-white/5 shadow-sm focus:ring-2"
                    >
                      <option value="usd" className='bg-white dark:bg-black/80'>USD</option>
                      <option value="eur" className='bg-white dark:bg-black/80'>EUR</option>
                      <option value="gbp" className='bg-white dark:bg-black/80'>GBP</option>
                    </select>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                >
                  <div className="relative">
                    <label className="block text-sm font-medium mb-2">
                      <span className="flex items-center gap-2">
                        <Hash className="w-4 h-4" />
                        Quantity
                      </span>
                    </label>
                    <input
                      type="number"
                      name="quantity"
                      disabled
                      value={formData.quantity}
                      onChange={handleInputChange}
                      className="w-full p-3 border rounded-lg bg-white/5 shadow-sm focus:ring-2"
                      min="1"
                      required
                    />
                  </div>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 }}
              >
                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-black dark:bg-orange-400 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200 font-medium shadow-sm"
                >
                  Pay
                </button>
              </motion.div>
            </form>
          </CardContent>
        </Card>

        <Card className="w-96 hidden lg:block">
          <CardHeader>
            <CardTitle className="text-xl font-bold">You're paying,</CardTitle>
            <div className="text-3xl font-bold mt-2">
              ${totalAmount.toFixed(2)}
            </div>
          </CardHeader>
          <CardContent>
            <OrderSummary />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CheckoutPage;