import Foundation
import Capacitor
import HealthKit

@objc(SleepPlugin)
public class SleepPlugin: CAPPlugin {

    let healthStore = HKHealthStore()

    @objc func deleteAppSleepSamples(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit not available")
            return
        }
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            call.reject("Sleep analysis type not available")
            return
        }

        // Query samples authored by this app (HKSource = default source = this app)
        let predicate = HKQuery.predicateForObjects(from: HKSource.default())
        let query = HKSampleQuery(
            sampleType: sleepType,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: nil
        ) { _, samples, error in
            if let error = error {
                call.reject("Delete query failed: \(error.localizedDescription)")
                return
            }
            guard let samples = samples, !samples.isEmpty else {
                call.resolve(["deleted": 0])
                return
            }
            self.healthStore.delete(samples) { success, deleteError in
                if success {
                    call.resolve(["deleted": samples.count])
                } else {
                    call.reject("Delete failed: \(deleteError?.localizedDescription ?? "unknown")")
                }
            }
        }
        healthStore.execute(query)
    }

    // Delete quantity samples authored by this app (HKSource.default()) for a given
    // HKQuantityTypeIdentifier, optionally constrained to a [startDate, endDate] window.
    // Used to clean up HRV samples written at the wrong timestamp before re-syncing them.
    @objc func deleteAppQuantitySamples(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit not available")
            return
        }
        guard let typeId = call.getString("sampleType") else {
            call.reject("sampleType identifier is required")
            return
        }
        guard let quantityType = HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: typeId)) else {
            call.reject("Unknown quantity type: \(typeId)")
            return
        }

        var predicates: [NSPredicate] = [HKQuery.predicateForObjects(from: HKSource.default())]
        if let start = call.getDouble("startDate"), let end = call.getDouble("endDate") {
            predicates.append(HKQuery.predicateForSamples(
                withStart: Date(timeIntervalSince1970: start),
                end: Date(timeIntervalSince1970: end),
                options: []))
        }
        let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: predicates)

        let query = HKSampleQuery(
            sampleType: quantityType,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: nil
        ) { _, samples, error in
            if let error = error {
                call.reject("Delete query failed: \(error.localizedDescription)")
                return
            }
            guard let samples = samples, !samples.isEmpty else {
                call.resolve(["deleted": 0])
                return
            }
            self.healthStore.delete(samples) { success, deleteError in
                if success {
                    call.resolve(["deleted": samples.count])
                } else {
                    call.reject("Delete failed: \(deleteError?.localizedDescription ?? "unknown")")
                }
            }
        }
        healthStore.execute(query)
    }

    // Generic quantity-sample save. Used for HealthKit types the old telerik plugin doesn't
    // know about (e.g. the iOS 16 AppleSleepingWristTemperature). Requests share/read
    // authorization for the specific type inline so the permission prompt is guaranteed.
    @objc func saveQuantitySample(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit not available")
            return
        }
        guard let typeId = call.getString("sampleType"),
              let unitStr = call.getString("unit"),
              let amount = call.getDouble("amount"),
              let start = call.getDouble("startDate"),
              let end = call.getDouble("endDate") else {
            call.reject("sampleType, unit, amount, startDate, endDate are required")
            return
        }
        guard let quantityType = HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: typeId)) else {
            call.reject("Unknown quantity type: \(typeId)")
            return
        }

        let unit = HKUnit(from: unitStr)
        let quantity = HKQuantity(unit: unit, doubleValue: amount)
        let sample = HKQuantitySample(
            type: quantityType,
            quantity: quantity,
            start: Date(timeIntervalSince1970: start),
            end: Date(timeIntervalSince1970: end)
        )

        healthStore.requestAuthorization(toShare: [quantityType], read: [quantityType]) { success, error in
            if !success {
                call.reject("Permission denied for \(typeId): \(error?.localizedDescription ?? "user denied")")
                return
            }
            self.healthStore.save(sample) { ok, saveError in
                if ok {
                    call.resolve(["saved": true])
                } else {
                    call.reject("Save failed: \(saveError?.localizedDescription ?? "unknown")")
                }
            }
        }
    }

    @objc func saveSleepStages(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("HealthKit not available")
            return
        }

        guard let windowStart = call.getDouble("windowStart"),
              let windowEnd = call.getDouble("windowEnd"),
              let stagesIn = call.getArray("stages") else {
            call.reject("windowStart, windowEnd (unix seconds) and stages[] are required")
            return
        }

        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            call.reject("Sleep analysis type not available")
            return
        }

        let windowStartDate = Date(timeIntervalSince1970: windowStart)
        let windowEndDate = Date(timeIntervalSince1970: windowEnd)

        // Build new samples from stage entries
        var newSamples: [HKCategorySample] = []
        for raw in stagesIn {
            guard let stage = raw as? [String: Any],
                  let start = (stage["startDate"] as? NSNumber)?.doubleValue,
                  let end = (stage["endDate"] as? NSNumber)?.doubleValue,
                  let stageType = stage["stage"] as? String,
                  end > start else {
                continue
            }
            let startD = Date(timeIntervalSince1970: start)
            let endD = Date(timeIntervalSince1970: end)
            let value = Self.mapStageToHKValue(stageType)
            newSamples.append(HKCategorySample(type: sleepType, value: value, start: startD, end: endD))
        }

        if newSamples.isEmpty {
            call.reject("No valid stages to save")
            return
        }

        healthStore.requestAuthorization(toShare: [sleepType], read: [sleepType]) { success, error in
            if !success {
                call.reject("Sleep permission denied: \(error?.localizedDescription ?? "user denied")")
                return
            }

            // Delete all app-authored sleep samples overlapping the night window (±4h buffer)
            // so repeated saves replace prior data for the same night without duplicating.
            let buffer: TimeInterval = 4 * 60 * 60
            let queryStart = windowStartDate.addingTimeInterval(-buffer)
            let queryEnd = windowEndDate.addingTimeInterval(buffer)
            let rangePredicate = HKQuery.predicateForSamples(withStart: queryStart, end: queryEnd, options: [])
            let appPredicate = HKQuery.predicateForObjects(from: HKSource.default())
            let combinedPredicate = NSCompoundPredicate(andPredicateWithSubpredicates: [rangePredicate, appPredicate])

            let dedupQuery = HKSampleQuery(
                sampleType: sleepType,
                predicate: combinedPredicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, queryError in
                if let queryError = queryError {
                    call.reject("Sleep dedup query failed: \(queryError.localizedDescription)")
                    return
                }
                let existing = samples ?? []

                let performSave = {
                    self.healthStore.save(newSamples) { ok, saveError in
                        if !ok {
                            call.reject("Failed to save sleep stages: \(saveError?.localizedDescription ?? "unknown error")")
                            return
                        }
                        // Verify: any app-authored sample in the window confirms write succeeded.
                        let verifyQuery = HKSampleQuery(
                            sampleType: sleepType,
                            predicate: combinedPredicate,
                            limit: 1,
                            sortDescriptors: nil
                        ) { _, verifySamples, verifyError in
                            if let verifyError = verifyError {
                                call.reject("Sleep verify query failed: \(verifyError.localizedDescription)")
                                return
                            }
                            if let v = verifySamples, !v.isEmpty {
                                call.resolve([
                                    "saved": true,
                                    "verified": true,
                                    "stagesSaved": newSamples.count,
                                    "replaced": existing.count
                                ])
                            } else {
                                call.reject("Sleep save failed verification - check Health > client > Sleep permission is enabled (write)")
                            }
                        }
                        self.healthStore.execute(verifyQuery)
                    }
                }

                if existing.isEmpty {
                    performSave()
                } else {
                    self.healthStore.delete(existing) { ok, delError in
                        if !ok {
                            call.reject("Failed to remove old sleep samples: \(delError?.localizedDescription ?? "unknown")")
                            return
                        }
                        performSave()
                    }
                }
            }

            self.healthStore.execute(dedupQuery)
        }
    }

    private static func mapStageToHKValue(_ stage: String) -> Int {
        let s = stage.lowercased()
        if #available(iOS 16.0, *) {
            switch s {
            case "deep":
                return HKCategoryValueSleepAnalysis.asleepDeep.rawValue
            case "light":
                return HKCategoryValueSleepAnalysis.asleepCore.rawValue
            case "rem":
                return HKCategoryValueSleepAnalysis.asleepREM.rawValue
            case "wake", "awake", "restless":
                return HKCategoryValueSleepAnalysis.awake.rawValue
            default:
                return HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
            }
        } else {
            switch s {
            case "wake", "awake", "restless":
                return HKCategoryValueSleepAnalysis.awake.rawValue
            default:
                return HKCategoryValueSleepAnalysis.asleep.rawValue
            }
        }
    }
}
