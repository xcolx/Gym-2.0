//
//  ActivityBoardView.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 03.11.2026.
//

import SwiftUI

/// The minutes worked out per day of the last year as a board of squares, a column per week, darker the longer the
/// workouts of the day were. Tapping a day shows its minutes, until it's tapped again or the overview clears it.
struct ActivityBoardView: View {

    /// By the start of the day
    let minutesByDay: [Date: Int]

    @Binding var selectedDay: Date?

    @Environment(UserSettings.self) var userSettings

    private let calendar = Calendar.current
    private let weekCount = 53
    private let cellSize: CGFloat = 13
    private let spacing: CGFloat = 3

    private var today: Date {
        calendar.startOfDay(for: .now)
    }

    /// The weeks of the last year, oldest first, each with its days from the first weekday of the calendar
    private var weeks: [[Date]] {
        let weekStart = calendar.dateInterval(of: .weekOfYear, for: today)?.start ?? today
        return (0..<weekCount).reversed().map { offset in
            let start = calendar.date(byAdding: .weekOfYear, value: -offset, to: weekStart) ?? weekStart
            return (0..<7).map { calendar.date(byAdding: .day, value: $0, to: start) ?? start }
        }
    }

    var body: some View {
        let weeks = weeks
        let firstDay = weeks.first?.first ?? today
        let minutesThisYear = minutesByDay.filter { $0.key >= firstDay }.values.reduce(0, +)

        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text("Activity")
                    .font(.headline)
                Spacer()
                Group {
                    if let selectedDay {
                        let minutes = minutesByDay[selectedDay] ?? 0
                        Text("\(selectedDay.formatted(.dateTime.day().month())): \(minutes == 0 ? "no workout" : StatsSummary.formatDuration(minutes: minutes))")
                    } else {
                        Text("\(StatsSummary.formatDuration(minutes: minutesThisYear)) in the last year")
                    }
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
                .contentTransition(.numericText())
            }

            HStack(alignment: .top, spacing: 6) {
                weekdayLabels

                ScrollView(.horizontal, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 4) {
                        monthLabels(weeks)
                        HStack(spacing: spacing) {
                            ForEach(weeks, id: \.first) { week in
                                VStack(spacing: spacing) {
                                    ForEach(week, id: \.self) { day in
                                        cell(day)
                                    }
                                }
                            }
                        }
                    }
                }
                .defaultScrollAnchor(.trailing)
            }

            HStack(spacing: spacing) {
                Spacer()
                Text("Less")
                    .padding(.trailing, 2)
                ForEach([0, 15, 45, 75, 90], id: \.self) { minutes in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(color(minutes: minutes))
                        .frame(width: cellSize, height: cellSize)
                }
                Text("More")
                    .padding(.leading, 2)
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
            .accessibilityHidden(true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Activity")
        .accessibilityValue("\(StatsSummary.formatDuration(minutes: minutesThisYear)) in the last year")
    }

    // The first, third and fifth weekday, like on GitHub
    private var weekdayLabels: some View {
        let symbols = calendar.shortWeekdaySymbols
        return VStack(alignment: .leading, spacing: spacing) {
            ForEach(0..<7, id: \.self) { row in
                Text(row % 2 == 0 && row < 6 ? symbols[(calendar.firstWeekday - 1 + row) % 7] : "")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .frame(height: cellSize)
            }
        }
        // below the month labels
        .padding(.top, 18)
    }

    // The month above the first week that starts in it
    private func monthLabels(_ weeks: [[Date]]) -> some View {
        HStack(spacing: spacing) {
            ForEach(Array(weeks.enumerated()), id: \.offset) { index, week in
                let start = week[0]
                // not in the last weeks, where the name would be cut off
                let startsMonth = index > 0 && index < weeks.count - 2 && calendar.component(.month, from: start) != calendar.component(.month, from: weeks[index - 1][0])
                Text(startsMonth ? start.formatted(.dateTime.month(.abbreviated)) : "")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize()
                    .frame(width: cellSize, height: 14, alignment: .leading)
            }
        }
    }

    private func cell(_ day: Date) -> some View {
        let minutes = minutesByDay[day] ?? 0
        let isSelected = day == selectedDay
        return RoundedRectangle(cornerRadius: 3)
            .fill(color(minutes: minutes))
            .overlay {
                if isSelected {
                    RoundedRectangle(cornerRadius: 3)
                        .strokeBorder(Color.primary, lineWidth: 1.5)
                }
            }
            .frame(width: cellSize, height: cellSize)
            // the rest of the current week
            .opacity(day > today ? 0 : 1)
            .onTapGesture {
                guard day <= today else { return }
                withAnimation(.snappy(duration: 0.2)) {
                    selectedDay = isSelected ? nil : day
                }
            }
    }

    private func color(minutes: Int) -> Color {
        switch minutes {
        case ..<1: Color(.systemFill)
        case ..<30: userSettings.appColor.opacity(0.3)
        case ..<60: userSettings.appColor.opacity(0.55)
        case ..<90: userSettings.appColor.opacity(0.8)
        default: userSettings.appColor
        }
    }
}
