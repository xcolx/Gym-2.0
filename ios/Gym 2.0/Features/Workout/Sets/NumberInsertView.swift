//
//  NumberInsertView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 29.08.2024.
//

import SwiftUI

struct NumberInsertView: View {

    @Bindable var workoutExercise: WorkoutExercise
    @Environment(UserSettings.self) var userSettings
    @Environment(StopwatchStore.self) var stopwatchStore: StopwatchStore?

    // The text of every field per tracked metric, in the unit the user picked
    @State var strings: [SetMetric: [String]] = [:]

    @FocusState var focusedField: Field?

    struct Field: Hashable {
        let metric: SetMetric
        let set: Int
    }

    // Smaller fields when there are many columns
    private var fieldFont: Font {
        workoutExercise.trackedMetrics.count <= 2 ? .title : .headline
    }

    var body: some View {

        ZStack{
            ScrollView{
                HStack{
                        VStack{
                            Text("Set")
                                .frame(height: 35)
                            if workoutExercise.unilateral{
                                ForEach(0..<workoutExercise.entryCount, id: \.self) {set in
                                    if set % 2 == 0{
                                        Text("\(set / 2 + 1)  R")
                                            .frame(height: 35)
                                    } else {
                                        Text("    L")
                                            .frame(height: 35, alignment: .trailing)
                                    }

                                }
                            } else {
                                ForEach(0..<workoutExercise.entryCount, id: \.self) {set in
                                    Text("\(set+1)")
                                        .frame(height: 35)
                                }
                            }
                        }

                        ForEach(workoutExercise.trackedMetrics, id: \.self) { metric in
                            column(metric)
                        }
                    }


                    .padding(10)

                    }
                    .scrollIndicators(.hidden)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke()
                    )
                    .padding(.horizontal, 10)
            }
            .toolbar {
                // The decimal pad has no minus key, only the intensity can be negative
                if let focusedField, focusedField.metric == .intensity {
                    ToolbarItemGroup(placement: .keyboard) {
                        Button("±") {
                            toggleSign(focusedField)
                        }
                        Spacer()
                    }
                }
                // Only in the performing workout, there the store is in the environment
                if let focusedField, focusedField.metric == .time, let stopwatchStore {
                    ToolbarItemGroup(placement: .keyboard) {
                        stopwatch(focusedField, store: stopwatchStore)
                    }
                }
            }
            .onAppear{
                setStrings()
            }
            .onChange(of: workoutExercise.entryCount){
                setStrings()
            }
            .onChange(of: workoutExercise.trackedMetrics){
                setStrings()
            }
            .onChange(of: userSettings.weightUnit){
                setStrings()
            }
            .onChange(of: userSettings.distanceUnit){
                setStrings()
            }
            // The field shows the value formatted once it is left, e.g. "90" as "1:30" or "10000" as "10'000"
            .onChange(of: focusedField){ oldField, _ in
                if let oldField {
                    showStoredValue(oldField)
                }
            }

    }

    func column(_ metric: SetMetric) -> some View {
        VStack{
            Text(header(metric))
                .frame(height: 35)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            if let values = strings[metric], values.count == workoutExercise.entryCount{
                ForEach(0..<workoutExercise.entryCount, id: \.self) {set in
                    TextField(placeholder(metric), text: binding(metric, set: set))
                        .font(fieldFont)
                        .multilineTextAlignment(.center)
                        .frame(height: 35)
                        .keyboardType(keyboard(metric))
                        .focused($focusedField, equals: Field(metric: metric, set: set))
                        .background(Color.gray.opacity(0.3), in: .rect(cornerRadius: 10))
                }
            }
        }
    }

    func binding(_ metric: SetMetric, set: Int) -> Binding<String> {
        Binding(
            get: { strings[metric]?[safe: set] ?? "" },
            set: { text in
                guard strings[metric]?.indices.contains(set) == true else { return }
                strings[metric]?[set] = text
                textChanged(metric, set: set)
            }
        )
    }

    func header(_ metric: SetMetric) -> String {
        switch metric {
        case .reps: "Reps"
        case .weights: userSettings.weightUnit.weightSymbol
        case .time: "Time"
        case .intensity: "Level"
        case .distance: userSettings.distanceUnit.distanceSymbol
        }
    }

    func placeholder(_ metric: SetMetric) -> String {
        metric == .time ? "m.ss" : ""
    }

    func keyboard(_ metric: SetMetric) -> UIKeyboardType {
        metric == .reps ? .numberPad : .decimalPad
    }

    // Takes the entered text over if it is valid, otherwise the field shows the stored value again.
    // An empty field and partial input like "-" or "1:" are kept as they are.
    func textChanged(_ metric: SetMetric, set: Int) {
        guard let text = strings[metric]?[set], workoutExercise.value(of: metric, at: set) != nil else { return }

        if let value = parse(text, metric: metric), metric.range.contains(value) {
            // Not set again for the value that is shown, e.g. right after setStrings formatted it
            if parse(format(workoutExercise.value(of: metric, at: set) ?? 0, metric: metric), metric: metric) != value {
                workoutExercise.setValue(value, of: metric, at: set)
            }
        } else {
            showStoredValue(Field(metric: metric, set: set))
        }
    }

    func showStoredValue(_ field: Field) {
        guard strings[field.metric]?.indices.contains(field.set) == true,
              let stored = workoutExercise.value(of: field.metric, at: field.set) else { return }
        strings[field.metric]?[field.set] = stored != 0 ? format(stored, metric: field.metric) : ""
    }

    // The value in the stored unit, nil if the text is invalid
    func parse(_ text: String, metric: SetMetric) -> Double? {
        // e.g. a German keyboard enters a comma
        let text = text.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: ",", with: ".")
            .replacingOccurrences(of: "'", with: "")
        if text.isEmpty || (metric == .intensity && text == "-") {
            return 0
        }
        switch metric {
        case .reps:
            return Int(text).map(Double.init)
        case .weights:
            return Double(text).map { userSettings.weightUnit.kilograms(fromWeight: $0) }
        case .time:
            return Self.seconds(from: text).map(Double.init)
        case .intensity:
            return Double(text)
        case .distance:
            return Double(text).map { userSettings.distanceUnit.meters(fromDistance: $0) }
        }
    }

    // The text of a stored value in the unit the user picked, e.g. "80.5" or "1:30"
    func format(_ value: Double, metric: SetMetric) -> String {
        switch metric {
        case .reps:
            return String(Int(value))
        case .weights:
            return UnitSystem.number(userSettings.weightUnit.weight(fromKilograms: value), maxDecimals: 1)
        case .time:
            return StatsSummary.formatSetTime(seconds: Int(value))
        case .intensity:
            return UnitSystem.number(value, maxDecimals: 2)
        case .distance:
            return Self.groupThousands(UnitSystem.number(userSettings.distanceUnit.distance(fromMeters: value), maxDecimals: 1))
        }
    }

    // e.g. "10000.5" as "10'000.5", numbers below 1000 stay the same
    static func groupThousands(_ number: String) -> String {
        let parts = number.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
        var integer = String(parts[0])
        var index = integer.endIndex
        while integer.distance(from: integer.startIndex, to: index) > 3 {
            index = integer.index(index, offsetBy: -3)
            integer.insert("'", at: index)
        }
        return parts.count > 1 ? integer + "." + parts[1] : integer
    }

    // Without a point the number are seconds, "90" is 1:30. With a point it are minutes and seconds, "5.59" is 5:59,
    // "0.1" is 0:10 and seconds from 60 carry over, "8.79" is 9:19. A formatted time like "1:30" or "1:00:00" is read too.
    static func seconds(from text: String) -> Int? {
        let separator: Character = text.contains(":") ? ":" : "."
        let parts = text.split(separator: separator, omittingEmptySubsequences: false)
        guard parts.allSatisfy({ $0.allSatisfy(\.isASCIIDigit) }) else { return nil }

        if separator == ":" {
            guard parts.count <= 3 else { return nil }
            return parts.reduce(0) { $0 * 60 + (Int($1) ?? 0) }
        }
        guard parts.count <= 2 else { return nil }
        let first = Int(parts[0]) ?? 0
        guard parts.count == 2 else { return first }
        // the digits after the point are the seconds like decimals, so one digit are tens of seconds
        let secondsText = parts[1]
        guard secondsText.count <= 2 else { return nil }
        let seconds = (Int(secondsText) ?? 0) * (secondsText.count == 1 ? 10 : 1)
        return first * 60 + seconds
    }

    // Start at 0, pause and stop while running, resume and stop while paused.
    // Stop takes the measured time over into the field.
    func stopwatch(_ field: Field, store: StopwatchStore) -> some View {
        let key = StopwatchStore.Key(workoutExercise: workoutExercise.persistentModelID, set: field.set)
        let fieldSeconds = workoutExercise.value(of: .time, at: field.set) ?? 0
        let stopwatch = store.stopwatch(for: key, fieldSeconds: fieldSeconds)

        return HStack{
            TimelineView(.periodic(from: .now, by: 0.1)) { context in
                Text(Self.formatStopwatch(stopwatch.elapsed(at: context.date)))
                    .font(.headline.monospacedDigit())
            }
            Spacer()
            if stopwatch.isRunning {
                Button("Pause") {
                    store.pause(key, fieldSeconds: fieldSeconds)
                }
                Button("Stop") {
                    stopStopwatch(field, key: key, store: store, fieldSeconds: fieldSeconds)
                }
            } else if stopwatch.accumulated > 0 {
                Button("Resume") {
                    store.start(key, fieldSeconds: fieldSeconds)
                }
                Button("Stop") {
                    stopStopwatch(field, key: key, store: store, fieldSeconds: fieldSeconds)
                }
            } else {
                Button("Start") {
                    store.start(key, fieldSeconds: fieldSeconds)
                }
            }
        }
    }

    func stopStopwatch(_ field: Field, key: StopwatchStore.Key, store: StopwatchStore, fieldSeconds: Double) {
        let seconds = store.stop(key, fieldSeconds: fieldSeconds).rounded()
        let value = min(max(seconds, SetMetric.time.range.lowerBound), SetMetric.time.range.upperBound)
        workoutExercise.setValue(value, of: .time, at: field.set)
        showStoredValue(field)
    }

    // e.g. "1:05.3", with the tenths of a second so the user sees it running
    static func formatStopwatch(_ interval: TimeInterval) -> String {
        let tenths = Int(interval * 10)
        return StatsSummary.formatSetTime(seconds: tenths / 10) + ".\(tenths % 10)"
    }

    func toggleSign(_ field: Field) {
        guard let text = strings[field.metric]?[safe: field.set] else { return }
        let newText = text.hasPrefix("-") ? String(text.dropFirst()) : "-" + text
        strings[field.metric]?[field.set] = newText
        textChanged(field.metric, set: field.set)
    }

    func setStrings(){
        var newStrings: [SetMetric: [String]] = [:]
        for metric in workoutExercise.trackedMetrics {
            newStrings[metric] = (0..<workoutExercise.entryCount).map { set in
                let value = workoutExercise.value(of: metric, at: set) ?? 0
                return value != 0 ? format(value, metric: metric) : ""
            }
        }
        strings = newStrings
    }


}

private extension Character {
    var isASCIIDigit: Bool {
        isASCII && isNumber
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
