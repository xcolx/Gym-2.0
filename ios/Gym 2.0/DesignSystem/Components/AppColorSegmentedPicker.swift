//
//  AppColorSegmentedPicker.swift
//  Gym 2.0
//
//  Created by Colin Rüegg on 13.10.2026.
//

import SwiftUI

// A segmented picker with the selected segment in the app color. The segmented style of Picker ignores the tint.
struct AppColorSegmentedPicker<Option: Hashable>: View {

    let options: [Option]
    @Binding var selection: Option
    let title: (Option) -> String

    @Environment(UserSettings.self) var userSettings
    @Namespace private var namespace

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.self) { option in
                let isSelected = option == selection
                Button {
                    withAnimation(.snappy(duration: 0.2)) {
                        selection = option
                    }
                } label: {
                    Text(title(option))
                        .font(.subheadline.weight(.medium))
                        .lineLimit(1)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .foregroundStyle(isSelected ? userSettings.appColorForeground : Color.primary)
                        .background {
                            if isSelected {
                                RoundedRectangle(cornerRadius: 7)
                                    .fill(userSettings.appColor)
                                    .matchedGeometryEffect(id: "selection", in: namespace)
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .padding(2)
        .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 9))
    }
}
