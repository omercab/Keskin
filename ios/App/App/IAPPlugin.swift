import Foundation
import Capacitor
import StoreKit

@objc(IAPPlugin)
public class IAPPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IAPPlugin"
    public let jsName = "IAPPurchases"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getActiveEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showManageSubscriptions", returnType: CAPPluginReturnPromise)
    ]

    private var updatesTask: Task<Void, Never>?

    override public func load() {
        // Transactions can arrive outside purchase() (renewals, family-sharing
        // approvals that finish after the app was backgrounded). Finish them as
        // they show up so they don't stay stuck in the queue.
        updatesTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let transaction) = result {
                    await transaction.finish()
                }
                self?.notifyListeners("entitlementsChanged", data: [:])
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds", String.self), !ids.isEmpty else {
            call.reject("productIds gerekli")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: ids)
                let list = products.map { p -> [String: Any] in
                    return [
                        "id": p.id,
                        "displayName": p.displayName,
                        "description": p.description,
                        "displayPrice": p.displayPrice,
                        "price": NSDecimalNumber(decimal: p.price).doubleValue
                    ]
                }
                call.resolve(["products": list])
            } catch {
                call.reject("Ürünler alınamadı: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId gerekli")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Ürün bulunamadı: \(productId)")
                    return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        call.resolve(["status": "success", "productId": transaction.productID])
                    case .unverified(_, let error):
                        call.reject("Doğrulama başarısız: \(error.localizedDescription)")
                    }
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.resolve(["status": "unknown"])
                }
            } catch {
                call.reject("Satın alma başarısız: \(error.localizedDescription)")
            }
        }
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch {
                // AppStore.sync() can fail (e.g. user dismisses the sign-in
                // sheet) — fall through and report whatever entitlements are
                // already known locally rather than failing the whole call.
            }
            await self.resolveEntitlements(call)
        }
    }

    @objc func getActiveEntitlements(_ call: CAPPluginCall) {
        Task {
            await self.resolveEntitlements(call)
        }
    }

    @objc func showManageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = self.bridge?.viewController?.view.window?.windowScene else {
                call.reject("Pencere bulunamadı")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject("Abonelik yönetimi açılamadı: \(error.localizedDescription)")
            }
        }
    }

    private func resolveEntitlements(_ call: CAPPluginCall) async {
        var active: [String] = []
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, transaction.revocationDate == nil {
                if let expirationDate = transaction.expirationDate, expirationDate < Date() {
                    continue
                }
                active.append(transaction.productID)
            }
        }
        call.resolve(["activeProductIds": active])
    }
}
